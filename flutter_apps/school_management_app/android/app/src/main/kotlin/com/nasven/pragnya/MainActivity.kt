package com.nasven.pragnya

import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {

    /**
     * FLAG_SECURE blocks screenshots, screen recording and the recents-app thumbnail.
     *
     * Without it, every screen that shows a student is one screenshot away from leaking:
     * Aadhaar number, bank account number, parent phone number, salary, marks. Those
     * screens are the whole point of the app, so this is set for every screen rather than
     * per-route — a per-route opt-in would fail open the first time someone added a
     * screen and forgot.
     *
     * It also blocks the display on non-secure displays, which is the intended
     * behaviour for a school deploying to shared or loaned tablets.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
        super.onCreate(savedInstanceState)
    }
}