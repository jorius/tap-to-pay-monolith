package expo.modules.nfctap

import android.content.Context

const val TAG = "NfcTap"

// The APDUs both phones speak (SDD §6): our proprietary AID is F0 + "IAPAY" + version 01.
object Apdu {
  val AID: ByteArray = hexToBytes("F0494150415901")

  // SELECT by name: CLA 00, INS A4, P1 04, P2 00, Lc 07, the AID, Le 00.
  val SELECT_COMMAND: ByteArray = hexToBytes("00A4040007F049415041590100")

  val SW_OK: ByteArray = hexToBytes("9000")
  val SW_NOT_OUR_AID: ByteArray = hexToBytes("6A82")
  val SW_NO_PAYLOAD: ByteArray = hexToBytes("6985")

  // Any SELECT by name for our AID, whatever P2 and with or without Le, since readers differ there.
  fun isSelectOurAid(command: ByteArray): Boolean =
    command.size >= 5 + AID.size &&
      command[0] == 0x00.toByte() &&
      command[1] == 0xA4.toByte() &&
      command[2] == 0x04.toByte() &&
      command[4].toInt() == AID.size &&
      command.copyOfRange(5, 5 + AID.size).contentEquals(AID)

  fun hexToBytes(hex: String): ByteArray =
    ByteArray(hex.length / 2) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
}

fun ByteArray.toHex(): String = joinToString("") { "%02X".format(it) }

// The card payload (the buyer's wallet address) lives in SharedPreferences, because Android starts HceCardService on
// its own, possibly with the app process dead, so the service cannot ask JavaScript for it.
object CardPayload {
  private const val PREFS = "nfc_tap"
  private const val KEY = "payload"

  // The card on the Tarjeta screen (memory only, set from JavaScript) and whether the app is in front; the module
  // writes both on the main thread and the card service reads them on its own.
  @Volatile var shown: String? = null
  @Volatile var inFront = false

  // What a tap answers: the card on screen while the app is in front, else the stored default card. A phone that was
  // never made a card answers nothing.
  fun answer(context: Context): String? {
    val stored = get(context) ?: return null
    return shown?.takeIf { inFront } ?: stored
  }

  fun get(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)

  fun set(context: Context, payload: String?) {
    val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    if (payload == null) editor.remove(KEY) else editor.putString(KEY, payload)
    editor.apply()
  }
}
