package expo.modules.nfctap

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

// The card side (SDD §6): Android routes a SELECT for our AID here, even with the app closed, while the screen is on.
class HceCardService : HostApduService() {
  override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
    Log.d(TAG, "card: APDU in ${commandApdu.toHex()}")
    if (!Apdu.isSelectOurAid(commandApdu)) {
      Log.d(TAG, "card: not our SELECT, answering 6A82")
      return Apdu.SW_NOT_OUR_AID
    }
    val payload = CardPayload.answer(this)
    if (payload.isNullOrEmpty()) {
      Log.d(TAG, "card: no payload stored, answering 6985")
      return Apdu.SW_NO_PAYLOAD
    }
    Log.d(TAG, "card: SELECT AID ok, answering payload=$payload")
    return payload.toByteArray(Charsets.UTF_8) + Apdu.SW_OK
  }

  override fun onDeactivated(reason: Int) {
    val why = if (reason == DEACTIVATION_LINK_LOSS) "link lost" else "deselected"
    Log.d(TAG, "card: deactivated ($why)")
  }
}
