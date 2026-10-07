// Item 12: real StoreKit purchase flow for the anonymous free-trial top-up.
// Uses react-native-iap (adds native module -- picked up automatically by
// EAS's prebuild/Continuous Native Generation on the next build, no manual
// Xcode project editing needed for a managed Expo app).
//
// Flow: user hits the $0.50 lifetime cap -> buys the $3 top-up product via
// StoreKit -> we verify we got a successful transaction -> call the
// backend's /anon/iap-credit to add $3 of spend headroom for this device.
// NOTE: this is an on-device-only purchase confirmation for v1 (no backend
// receipt validation against Apple's servers yet) -- acceptable for a low
// dollar amount at this stage, flagged as a follow-up hardening item.
import { Platform } from 'react-native';
import { creditAnonIap } from './anon';

// Must match a Consumable In-App Purchase product configured in App Store
// Connect for bundle id com.orchat.app. Needs to be created there manually
// before this can complete a real purchase (Apple-side manual step).
export const IAP_TOPUP_PRODUCT_ID = 'com.orchat.app.topup_3usd';
export const IAP_TOPUP_AMOUNT_USD = 3;

let iap = null;
function getIap() {
  if (iap) return iap;
  // Lazy require so Jest / non-iOS environments without the native module
  // linked don't crash just importing this file.
  iap = require('react-native-iap');
  return iap;
}

export async function initIap() {
  if (Platform.OS !== 'ios') return;
  const RNIap = getIap();
  await RNIap.initConnection();
}

export async function endIap() {
  if (Platform.OS !== 'ios') return;
  const RNIap = getIap();
  await RNIap.endConnection();
}

export async function fetchTopupProduct() {
  const RNIap = getIap();
  const products = await RNIap.getProducts([IAP_TOPUP_PRODUCT_ID]);
  return products[0] || null;
}

// Runs the purchase, then credits the backend. Returns the updated anon
// status ({ spend_usd, remaining_usd, locked, iap_credit_usd }).
export async function purchaseTopupAndCredit(deviceId) {
  const RNIap = getIap();
  const purchase = await RNIap.requestPurchase({ sku: IAP_TOPUP_PRODUCT_ID });
  // Acknowledge/finish the transaction so StoreKit doesn't keep retrying it.
  await RNIap.finishTransaction({ purchase, isConsumable: true });
  return creditAnonIap(deviceId, IAP_TOPUP_AMOUNT_USD);
}
