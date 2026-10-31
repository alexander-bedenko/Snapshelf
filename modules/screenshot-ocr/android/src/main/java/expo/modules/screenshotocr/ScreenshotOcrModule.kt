package expo.modules.screenshotocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

private const val ENGINE_MLKIT_LATIN = "mlkit-latin"

class ScreenshotOcrModule : Module() {
  private val latinRecognizer: TextRecognizer by lazy {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  }

  override fun definition() = ModuleDefinition {
    Name("ScreenshotOcr")

    AsyncFunction("recognize") { imageUri: String, engine: String, promise: Promise ->
      if (engine != ENGINE_MLKIT_LATIN) {
        promise.reject(CodedException("ERR_OCR_ENGINE", "Unknown OCR engine: $engine", null))
        return@AsyncFunction
      }

      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(imageUri))
      } catch (e: IOException) {
        promise.reject(CodedException("ERR_OCR_IMAGE", "Cannot read image: $imageUri", e))
        return@AsyncFunction
      }

      val startedAt = System.nanoTime()
      latinRecognizer.process(image)
        .addOnSuccessListener { result ->
          promise.resolve(
            mapOf(
              "text" to result.text,
              "engine" to ENGINE_MLKIT_LATIN,
              "durationMs" to (System.nanoTime() - startedAt) / 1_000_000
            )
          )
        }
        .addOnFailureListener { e ->
          promise.reject(CodedException("ERR_OCR_FAILED", e.message ?: "OCR failed", e))
        }
    }

    OnDestroy {
      latinRecognizer.close()
    }
  }
}
