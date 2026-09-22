import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Play Store auto-upload (gradle-play-publisher) — only active when
    // PLAY_SERVICE_ACCOUNT_FILE env / service-account.json exists.
    id("com.github.triplet.play") version "3.13.0"
}

// ---- Release signing: read from android/key.properties (local) or env (CI) ----
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

fun signingSecret(name: String): String {
    // Fall back to CI env vars (deploy-android.yml sets these).
    return keystoreProperties.getProperty(name) ?: System.getenv(name) ?: ""
}

android {
    namespace = "com.nasven.pragnya.admin"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.nasven.pragnya.admin"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = signingSecret("ANDROID_KEY_ALIAS")
            keyPassword = signingSecret("ANDROID_KEY_PASSWORD")
            storeFile = file(signingSecret("ANDROID_KEYSTORE").ifEmpty { "upload-keystore.jks" })
            storePassword = signingSecret("ANDROID_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            // Release build is signed with the upload keystore (Play App Signing).
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// ---- Play Store auto-upload (only when credentials available) ----
if (System.getenv("PLAY_SERVICE_ACCOUNT_FILE") != null || file("service-account.json").exists()) {
    play {
        serviceAccountCredentials.set(file(System.getenv("PLAY_SERVICE_ACCOUNT_FILE") ?: "service-account.json"))
        // Override track in CI: ./gradlew publishBundle -PplayTrack=alpha
        track.set(providers.gradleProperty("playTrack").orElse("internal"))
        releaseStatus.set(com.github.triplet.gradle.androidpublisher.ReleaseStatus.COMPLETED)
    }
}