package expo.modules.nfctap

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.cardemulation.CardEmulation
import android.nfc.tech.IsoDep
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

// What JavaScript sees as NfcTap (SDD §6): the terminal's reader mode and the card's stored payload.
class NfcTapModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("NfcTap")

    Events("onCard", "onError")

    Function("isSupported") { NfcAdapter.getDefaultAdapter(context) != null }

    Function("isEnabled") { NfcAdapter.getDefaultAdapter(context)?.isEnabled == true }

    Function("isHceSupported") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
    }

    Function("setCardPayload") { payload: String? ->
      CardPayload.set(context, payload)
      Log.d(TAG, if (payload == null) "card: payload cleared" else "card: payload set to $payload")
      appContext.currentActivity?.let { activity -> activity.runOnUiThread { preferCardService(activity) } }
    }

    Function("getCardPayload") { CardPayload.get(context) }

    // While the Tarjeta screen shows a card, taps pay with it; null hands them back to the stored default card.
    Function("setShownCard") { payload: String? ->
      Log.d(TAG, "card: shown card ${payload ?: "cleared"}")
      CardPayload.shown = payload
    }

    Function("startReader") { startReader() }

    Function("stopReader") { stopReader() }

    // Both run on the main thread inside onResume / onPause, where Android requires the activity to be resumed.
    OnActivityEntersForeground {
      CardPayload.inFront = true
      appContext.currentActivity?.let { preferCardService(it) }
    }

    OnActivityEntersBackground {
      CardPayload.inFront = false
      appContext.currentActivity?.let { releaseCardService(it) }
    }

    OnDestroy { stopReader() }
  }

  // While this app is in front with an active card, Android routes our AID to this app's card service even when other
  // installed apps claim it too, so its "select an app to use" chooser never shows on a tap. In the background the
  // chooser comes back if another app (an old build, the vendor app) also claims the AID.
  private fun preferCardService(activity: Activity) {
    val emulation = cardEmulation(activity) ?: return
    try {
      if (CardPayload.get(activity).isNullOrEmpty()) {
        emulation.unsetPreferredService(activity)
      } else {
        val preferred = emulation.setPreferredService(activity, ComponentName(activity, HceCardService::class.java))
        Log.d(TAG, "card: preferred service while in front=$preferred")
      }
    } catch (e: RuntimeException) {
      Log.d(TAG, "card: could not set the preferred service: ${e.message}")
    }
  }

  private fun releaseCardService(activity: Activity) {
    val emulation = cardEmulation(activity) ?: return
    try {
      emulation.unsetPreferredService(activity)
    } catch (e: RuntimeException) {
      Log.d(TAG, "card: could not release the preferred service: ${e.message}")
    }
  }

  private fun cardEmulation(context: Context): CardEmulation? {
    if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)) return null
    val adapter = NfcAdapter.getDefaultAdapter(context) ?: return null
    return CardEmulation.getInstance(adapter)
  }

  // Reader mode is tied to the foreground activity; Android pauses and resumes it with the activity (SDD §6).
  private fun startReader() {
    val activity = appContext.currentActivity ?: return emitError("No foreground activity for the reader")
    val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return emitError("This phone has no NFC")
    Log.d(TAG, "reader: start requested enabled=${adapter.isEnabled}")
    val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
    activity.runOnUiThread {
      adapter.enableReaderMode(activity, { tag -> onTag(tag) }, flags, null)
      Log.d(TAG, "reader: reader mode ON")
    }
  }

  private fun stopReader() {
    val activity = appContext.currentActivity ?: return
    val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
    activity.runOnUiThread {
      adapter.disableReaderMode(activity)
      Log.d(TAG, "reader: reader mode OFF")
    }
  }

  // Called on an NFC binder thread for every tag that enters the field: one SELECT, one answer.
  private fun onTag(tag: Tag) {
    Log.d(TAG, "reader: tag discovered techs=${tag.techList.joinToString { it.substringAfterLast('.') }}")
    val isoDep = IsoDep.get(tag) ?: return emitError("Tag is not ISO-DEP")
    try {
      isoDep.connect()
      isoDep.timeout = 5000
      Log.d(TAG, "reader: APDU out ${Apdu.SELECT_COMMAND.toHex()}")
      val response = isoDep.transceive(Apdu.SELECT_COMMAND)
      Log.d(TAG, "reader: response ${response.toHex()}")
      if (response.size < 2) return emitError("Card answered without a status word")
      val status = response.copyOfRange(response.size - 2, response.size)
      if (!status.contentEquals(Apdu.SW_OK)) return emitError("Card answered SW ${status.toHex()}")
      val payload = String(response, 0, response.size - 2, Charsets.UTF_8)
      Log.d(TAG, "reader: payload=$payload")
      sendEvent("onCard", mapOf("payload" to payload))
    } catch (e: IOException) {
      // TagLostException and timeouts land here: the phones moved apart mid-exchange.
      emitError(e.message ?: "Lost the card: hold the phones closer")
    } finally {
      try {
        isoDep.close()
      } catch (ignored: IOException) {
      }
    }
  }

  private fun emitError(message: String) {
    Log.d(TAG, "reader: error $message")
    sendEvent("onError", mapOf("message" to message))
  }
}
