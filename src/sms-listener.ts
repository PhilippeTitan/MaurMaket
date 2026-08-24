import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { UssdModule } = NativeModules;

export interface NatCashSms {
  sender: string;
  amount: string;
  recipientName: string;
  recipientNumber: string;
  time: string;
  date: string;
  fee: string;
  balance: string;
  transcode: string;
  timestamp: number;
}

export interface RawSms {
  sender: string;
  body: string;
  timestamp: number;
}

const NATCASH_REGEX = /Ou transfere ([\d,.]+) HTG a (.+?) (\d{8,}) nan (\d{2}:\d{2}) (\d{2}\/\d{2}\/\d{4}), fre: ([\d,.]+) HTG\. Balans ou: ([\d,.]+) HTG\. Transcode: (\d+)\./;

let emitter: NativeEventEmitter | null = null;

function getEmitter(): NativeEventEmitter {
  if (!emitter) {
    emitter = new NativeEventEmitter(UssdModule);
  }
  return emitter;
}

/**
 * Listen for ALL incoming SMS messages.
 * Works even during 4G→3G transitions (USSD) because SMS arrives
 * over the signaling channel, not data.
 */
export function onSmsReceived(callback: (sms: RawSms) => void): () => void {
  const sub = getEmitter().addListener('onSmsReceived', (sms: RawSms) => {
    callback(sms);
  });
  return () => sub.remove();
}

/**
 * Listen specifically for NatCash confirmation SMS.
 * Parses: "Ou transfere {amount} HTG a {NAME} {NUMBER} nan {TIME} {DATE}, fre: {fee} HTG..."
 * Fires immediately when the SMS arrives — no polling needed.
 */
export function onNatCashSms(callback: (sms: NatCashSms) => void): () => void {
  const sub = getEmitter().addListener('onNatCashSms', (sms: NatCashSms) => {
    callback(sms);
  });
  return () => sub.remove();
}

/**
 * Fallback: Read the most recent N SMS messages from the inbox
 * and scan for a NatCash confirmation. Used when the BroadcastReceiver
 * misses the SMS (e.g. permissions not yet granted when SMS arrived).
 */
export async function scanRecentSms(count = 3): Promise<NatCashSms | null> {
  if (Platform.OS !== 'android' || !UssdModule?.readRecentSms) return null;
  try {
    const messages: Array<{ sender: string; body: string; timestamp: number }> = await UssdModule.readRecentSms(count);
    for (const msg of messages) {
      const match = msg.body?.match(NATCASH_REGEX);
      if (match) {
        return {
          sender: msg.sender,
          amount: match[1].replace(/,/g, ''),
          recipientName: match[2].trim(),
          recipientNumber: match[3],
          time: match[4],
          date: match[5],
          fee: match[6].replace(/,/g, ''),
          balance: match[7].replace(/,/g, ''),
          transcode: match[8],
          timestamp: msg.timestamp,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
