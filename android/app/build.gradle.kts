import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// La URL de la web sale de la variable de entorno PRACTICA_WEB_URL o de gradle.properties.
val webUrl: String = System.getenv("PRACTICA_WEB_URL")?.takeIf { it.isNotBlank() }
    ?: providers.gradleProperty("practica.webUrl").orNull
    ?: "https://practica.workers.dev/"

android {
    namespace = "com.sky.practica"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sky.practica"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.1"
        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
    }

    // Llave fija en el repo: así cada APK de Bitrise se instala encima del anterior sin desinstalar.
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storeType = "pkcs12"
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}
