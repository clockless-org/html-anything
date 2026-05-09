/**
 * Converter registry. Order matters: the first one whose `matches` and
 * `detect` succeed wins. Most-specific converters first; the catch-all
 * fallbacks (e.g. plain text) last.
 *
 * Adding a converter: drop a file in this directory implementing the
 * Converter interface, import it here, append to the array.
 */
import type { Converter } from "../types.js"
import { converter as markdownConverter } from "./markdown.js"
import { converter as whatsappConverter } from "./whatsapp.js"
import { converter as csvConverter } from "./csv.js"

export const converters: Converter[] = [
  // WhatsApp must come before generic .txt — it `detect`s by inspecting
  // the first few lines for the timestamp prefix.
  whatsappConverter,
  csvConverter,
  markdownConverter,
]
