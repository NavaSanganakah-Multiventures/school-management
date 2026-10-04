package com.nasven.pragnya.admin

import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {

    /**
     * FLAG_SECURE blocks screenshots, screen recording and the recents-app thumbnail.
     *
     * This app is the highest-privilege surface in the product: it provisions schools,
     * reads billing and subscription records, and can issue payment links. A screenshot
     * of it leaks revenue and customer data, and the recents thumbnail would show that
     * screen to anyone who picks up the unlocked device.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
        super.onCreate(savedInstanceState)
    }
}