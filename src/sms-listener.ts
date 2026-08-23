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
