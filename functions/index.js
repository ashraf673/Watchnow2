const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getStorage } = require("firebase-admin/storage");

initializeApp();

/**
 * Removes cloud photo objects and their RTDB index records after 15 days.
 * Expected media record fields: type, storagePath, uploadedAt (Unix ms).
 * Only deletes objects under media/{deviceId}/originals/ to avoid touching
 * unrelated Firebase Storage content.
 */
exports.expireCloudPhotos = onSchedule(
  { schedule: "every 24 hours", timeZone: "UTC", region: "asia-southeast1" },
  async () => {
    const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
    const usersRef = getDatabase().ref("users");
    const usersSnapshot = await usersRef.get();
    const bucket = getStorage().bucket();
    const removals = [];

    usersSnapshot.forEach((userSnapshot) => {
      const devices = userSnapshot.child("devices");
      devices.forEach((deviceSnapshot) => {
        const media = deviceSnapshot.child("media");
        media.forEach((mediaSnapshot) => {
          const item = mediaSnapshot.val() || {};
          const uploadedAt = Number(item.uploadedAt || 0);
          const storagePath = String(item.storagePath || "");
          if (
            uploadedAt > 0 &&
            uploadedAt <= cutoff &&
            storagePath.startsWith("media/") &&
            storagePath.includes("/originals/")
          ) {
            removals.push((async () => {
              // Remove cloud object first. If it fails, keep metadata for retry.
              await bucket.file(storagePath).delete({ ignoreNotFound: true });
              await mediaSnapshot.ref.remove();
            })());
          }
        });
      });
    });

    const results = await Promise.allSettled(removals);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      console.error(`Cloud photo expiry: ${failed.length} deletion(s) failed`, failed);
      throw new Error(`${failed.length} cloud photo deletion(s) failed; will retry next run`);
    }
    console.log(`Cloud photo expiry completed: ${results.length} item(s) removed`);
  }
);
