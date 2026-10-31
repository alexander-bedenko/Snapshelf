package expo.modules.screenshotmedia

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenshotMediaModule : Module() {
  private var observer: ContentObserver? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenshotMedia")

    Events("onMediaChanged")

    AsyncFunction("listScreenshots") { sinceMs: Double ->
      queryScreenshots(sinceMs.toLong())
    }

    OnStartObserving("onMediaChanged") {
      registerObserver()
    }

    OnStopObserving("onMediaChanged") {
      unregisterObserver()
    }

    OnDestroy {
      unregisterObserver()
    }
  }

  private fun readPermission(): String =
    if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES
    else Manifest.permission.READ_EXTERNAL_STORAGE

  private fun queryScreenshots(sinceMs: Long): List<Map<String, Any>> {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    // Without the permission MediaStore silently returns only the app's own media, so check explicitly.
    if (context.checkSelfPermission(readPermission()) != PackageManager.PERMISSION_GRANTED) {
      throw CodedException("ERR_PERMISSION_DENIED", "Media permission is not granted", null)
    }

    val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    val modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    val pathColumn = if (modern) MediaStore.MediaColumns.RELATIVE_PATH else MediaStore.MediaColumns.DATA
    val selection =
      if (modern) "$pathColumn LIKE ? AND ${MediaStore.MediaColumns.IS_PENDING} = 0"
      else "$pathColumn LIKE ?"
    val projection = arrayOf(
      MediaStore.Images.Media._ID,
      MediaStore.Images.Media.DATE_TAKEN,
      MediaStore.Images.Media.DATE_ADDED,
      MediaStore.Images.Media.WIDTH,
      MediaStore.Images.Media.HEIGHT
    )

    val result = ArrayList<Map<String, Any>>()
    try {
      context.contentResolver.query(
        collection,
        projection,
        selection,
        arrayOf("%Screenshot%"),
        "${MediaStore.Images.Media.DATE_ADDED} DESC"
      )?.use { cursor ->
        val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
        val takenCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN)
        val addedCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
        val widthCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
        val heightCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
        while (cursor.moveToNext()) {
          val id = cursor.getLong(idCol)
          val taken = cursor.getLong(takenCol)
          val takenAt = if (taken > 0) taken else cursor.getLong(addedCol) * 1000
          if (takenAt < sinceMs) continue
          result.add(
            mapOf(
              "id" to id.toString(),
              "uri" to ContentUris.withAppendedId(collection, id).toString(),
              "takenAt" to takenAt,
              "width" to cursor.getInt(widthCol),
              "height" to cursor.getInt(heightCol)
            )
          )
        }
      }
    } catch (e: SecurityException) {
      throw CodedException("ERR_PERMISSION_DENIED", e.message ?: "Media permission is not granted", e)
    }
    return result
  }

  private fun registerObserver() {
    if (observer != null) return
    val context = appContext.reactContext ?: return
    val created = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean) {
        sendEvent("onMediaChanged", Bundle())
      }
    }
    context.contentResolver.registerContentObserver(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      true,
      created
    )
    observer = created
  }

  private fun unregisterObserver() {
    val current = observer ?: return
    appContext.reactContext?.contentResolver?.unregisterContentObserver(current)
    observer = null
  }
}
