package com.maurmaket.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class UssdModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "UssdModule"

    // ═══════════════════════════════════════════════════════════════════════════
    // SIM SUBSCRIPTION ENUMERATION (for carrier-aware payment routing)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Enumerate active SIM subscriptions.
     * Returns an array of { subscriptionId, carrier, displayName, number, simSlotIndex }.
     * Requires READ_PHONE_STATE permission (declared in AndroidManifest).
     *
     * Carrier detection: getCarrierName() returns the actual carrier ("Natcom", "Digicel"),
     * not the SIM slot number. This works even if SIMs are physically swapped.
     */
    @ReactMethod
    fun getSimSubscriptions(promise: Promise) {
        val ctx = reactApplicationContext
        val sm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? SubscriptionManager

        if (sm == null) {
            promise.resolve(Arguments.createArray())
            return
        }

        try {
            val subs = sm.activeSubscriptionInfoList
            if (subs == null || subs.isEmpty()) {
                promise.resolve(Arguments.createArray())
                return
            }

            val result = Arguments.createArray()
            for (info: SubscriptionInfo in subs) {
                val sub = Arguments.createMap()
                sub.putInt("subscriptionId", info.subscriptionId)

                // Carrier name (e.g. "Natcom", "Digicel")
                val carrier = info.carrierName?.toString() ?: ""
                sub.putString("carrier", carrier)

                // Display name (user-editable label, e.g. "SIM 1", "Work SIM")
                val displayName = info.displayName?.toString() ?: ""
                sub.putString("displayName", displayName)

                // Phone number (may be empty on some devices)
                val number = info.number ?: ""
                // Mask: show last 4 digits only (privacy)
                val masked = if (number.length > 4) {
                    "••••" + number.takeLast(4)
                } else if (number.isNotEmpty()) {
                    "••••$number"
                } else {
                    ""
                }
                sub.putString("number", masked)

                // SIM slot index (0-based, physical slot — NOT the subscription ID)
                sub.putInt("simSlotIndex", info.simSlotIndex)

                // Carrier name for comparison (lowercase, trimmed)
                sub.putString("carrierKey", carrier.lowercase().trim())

                result.pushMap(sub)
            }
            promise.resolve(result)
        } catch (e: SecurityException) {
            // READ_PHONE_STATE not granted — return empty list
            promise.resolve(Arguments.createArray())
        } catch (e: Exception) {
            promise.reject("SIM_ERROR", "Failed to enumerate SIMs: ${e.message}")
        }
    }

    /**
     * Dial a USSD code on a specific SIM subscription.
     * Uses TelephonyManager.createForSubscriptionId() to target the correct SIM.
     * Returns failure to JS if targeted USSD cannot be established — never falls back
     * to an untargeted system dialer, because *202# is ambiguous between NatCash and MonCash.
     */
    @ReactMethod
    fun dialUssdOnSubscription(code: String, subscriptionId: Int, promise: Promise) {
        val ctx = reactApplicationContext
        val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        if (tm == null) {
            promise.reject("NO_TELEPHONY", "TelephonyManager not available")
            return
        }

        // sendUssdRequest requires Android O (API 26)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.reject("UNSUPPORTED", "Targeted USSD requires Android 8.0 or higher")
            return
        }

        // Create a TelephonyManager scoped to the specific SIM subscription
        val targetTm = if (subscriptionId > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            ctx.getSystemService(TelephonyManager::class.java)?.createForSubscriptionId(subscriptionId) ?: tm
        } else {
            tm
        }

        val callback = object : TelephonyManager.UssdResponseCallback() {
            override fun onReceiveUssdResponse(
                telephonyManager: TelephonyManager,
                request: String,
                response: CharSequence
            ) {
                val result = Arguments.createMap()
                result.putBoolean("success", true)
                result.putString("response", response.toString())
                result.putString("request", request)
                promise.resolve(result)
            }

            override fun onReceiveUssdResponseFailed(
                telephonyManager: TelephonyManager,
                request: String,
                failureCode: Int
            ) {
                // Carrier blocked or rejected the in-app USSD request.
                // DO NOT fall back to untargeted system dialer — *202# is ambiguous.
                promise.reject("USSD_FAILED", "The carrier rejected the USSD session on this SIM. Please try again or select a different SIM.")
            }
        }

        try {
            targetTm.sendUssdRequest(code, callback, Handler(ctx.mainLooper))
        } catch (e: SecurityException) {
            promise.reject("NO_PERMISSION", "CALL_PHONE permission not granted: ${e.message}")
        } catch (e: Exception) {
            // sendUssdRequest itself failed (device-level issue, not carrier rejection)
            promise.reject("USSD_FAILED", "Could not start USSD session on this SIM: ${e.message}")
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // USSD (existing methods)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Dial a USSD code using ACTION_CALL intent.
     * Opens the system USSD dialog ON TOP of the current app.
     * Uses the device's default SIM — does NOT target a specific subscription.
     */
    @ReactMethod
    fun dialUssd(code: String, promise: Promise) {
        val ctx = reactApplicationContext
        val encodedCode = code.replace("#", "%23")
        try {
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$encodedCode"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            val result = Arguments.createMap()
            result.putBoolean("success", true)
            result.putString("message", "USSD dialog launched")
            promise.resolve(result)
        } catch (e: SecurityException) {
            try {
                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$encodedCode"))
                dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(dialIntent)
                val result = Arguments.createMap()
                result.putBoolean("success", true)
                result.putString("message", "Opened dialer (no phone permission)")
                promise.resolve(result)
            } catch (e2: Exception) {
                promise.reject("DIAL_FAILED", "Could not open dialer: ${e2.message}")
            }
        } catch (e: Exception) {
            promise.reject("DIAL_FAILED", "Could not dial USSD: ${e.message}")
        }
    }

    /**
     * Check if the device supports in-app USSD via sendUssdRequest.
     */
    @ReactMethod
    fun isSupported(promise: Promise) {
        val result = Arguments.createMap()
        result.putBoolean("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        result.putInt("apiLevel", Build.VERSION.SDK_INT)
        promise.resolve(result)
    }

    companion object {
        private const val USSD_RETURN_FAILURE = 1
        private const val USSD_ERROR_SERVICE_UNAVAIL = 2
    }
}
