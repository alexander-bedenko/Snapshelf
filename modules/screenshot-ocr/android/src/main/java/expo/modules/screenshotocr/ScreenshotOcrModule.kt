package expo.modules.screenshotocr

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val ENGINE_MLKIT_LATIN = "mlkit-latin"
private const val ENGINE_TESSERACT = "tesseract"

// Bundled tessdata_fast models (assets/tessdata). Russian first: it is why Tesseract is here.
private val TESS_LANGUAGES = listOf("rus", "eng", "pol")

class ScreenshotOcrModule : Module() {
  private val latinRecognizer: TextRecognizer by lazy {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  }

  // TessBaseAPI is not thread-safe: one instance, used only on this single thread.
  private val tessExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private var tess: TessBaseAPI? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenshotOcr")

    AsyncFunction("recognize") { imageUri: String, engine: String, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      when (engine) {
        ENGINE_MLKIT_LATIN -> recognizeMlKit(context, imageUri, promise)
        ENGINE_TESSERACT -> tessExecutor.execute { recognizeTesseract(context, imageUri, promise) }
        else -> promise.reject(CodedException("ERR_OCR_ENGINE", "Unknown OCR engine: $engine", null))
      }
    }

    OnDestroy {
      latinRecognizer.close()
      tessExecutor.execute {
        tess?.recycle()
        tess = null
      }
      tessExecutor.shutdown()
    }
  }

  private fun recognizeMlKit(context: Context, imageUri: String, promise: Promise) {
    val image = try {
      InputImage.fromFilePath(context, Uri.parse(imageUri))
    } catch (e: IOException) {
      promise.reject(CodedException("ERR_OCR_IMAGE", "Cannot read image: $imageUri", e))
      return
    }

    val startedAt = System.nanoTime()
    latinRecognizer.process(image)
      .addOnSuccessListener { result ->
        promise.resolve(resultMap(result.text, ENGINE_MLKIT_LATIN, startedAt))
      }
      .addOnFailureListener { e ->
        promise.reject(CodedException("ERR_OCR_FAILED", e.message ?: "OCR failed", e))
      }
  }

  /** Runs on [tessExecutor] only. */
  private fun recognizeTesseract(context: Context, imageUri: String, promise: Promise) {
    val bitmap = try {
      context.contentResolver.openInputStream(Uri.parse(imageUri))?.use { BitmapFactory.decodeStream(it) }
    } catch (e: Exception) {
      promise.reject(CodedException("ERR_OCR_IMAGE", "Cannot read image: $imageUri", e))
      return
    }
    if (bitmap == null) {
      promise.reject(CodedException("ERR_OCR_IMAGE", "Cannot decode image: $imageUri", null))
      return
    }

    try {
      val startedAt = System.nanoTime()
      val api = tesseract(context)
      api.setImage(bitmap)
      val text = api.getUTF8Text() ?: ""
      api.clear()
      promise.resolve(resultMap(text, ENGINE_TESSERACT, startedAt))
    } catch (e: Exception) {
      promise.reject(CodedException("ERR_OCR_FAILED", e.message ?: "Tesseract failed", e))
    } finally {
      bitmap.recycle()
    }
  }

  /** Lazily copies the bundled models and initializes Tesseract. Runs on [tessExecutor] only. */
  private fun tesseract(context: Context): TessBaseAPI {
    tess?.let { return it }
    val dataDir = File(context.filesDir, "tesseract")
    copyTessdata(context, File(dataDir, "tessdata"))
    val api = TessBaseAPI()
    // tessdata_fast models are LSTM-only.
    if (!api.init(dataDir.absolutePath, TESS_LANGUAGES.joinToString("+"), TessBaseAPI.OEM_LSTM_ONLY)) {
      api.recycle()
      throw IllegalStateException("Tesseract init failed for ${TESS_LANGUAGES.joinToString("+")}")
    }
    api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
    tess = api
    return api
  }

  /**
   * Tesseract needs the models as files, so they are copied from the APK assets once.
   * Written to a temp file and renamed, so a kill mid-copy never leaves a truncated model.
   */
  private fun copyTessdata(context: Context, dir: File) {
    if (!dir.isDirectory && !dir.mkdirs()) throw IOException("Cannot create $dir")
    for (lang in TESS_LANGUAGES) {
      val target = File(dir, "$lang.traineddata")
      if (target.isFile && target.length() > 0) continue
      val tmp = File(dir, "$lang.traineddata.tmp")
      context.assets.open("tessdata/$lang.traineddata").use { input ->
        tmp.outputStream().use { output -> input.copyTo(output) }
      }
      if (!tmp.renameTo(target)) throw IOException("Cannot move $tmp to $target")
    }
  }

  private fun resultMap(text: String, engine: String, startedAt: Long) = mapOf(
    "text" to text,
    "engine" to engine,
    "durationMs" to (System.nanoTime() - startedAt) / 1_000_000
  )
}
