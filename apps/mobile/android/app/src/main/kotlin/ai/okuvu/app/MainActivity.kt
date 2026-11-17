package ai.okuvu.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    /**
     * The notification channel the server sends on.
     *
     * FCM delivers without this, but Android then invents a fallback channel at
     * default importance — the notification slides into the tray with no sound
     * and no heads-up, which is the exact failure the owner would report as
     * "push doesn't work". Creating it here, at HIGH importance, once per
     * process, costs nothing and is the difference between a buzz and a silent
     * row.
     *
     * The id must match `PUSH_CHANNEL_ID` in apps/api/src/lib/push.ts. Renaming
     * it on one side only lands every message on the silent fallback channel.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "okuvu_care_team",
                "Your care team",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Homework, reminders and session updates from your care team"
                enableVibration(true)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }
}
