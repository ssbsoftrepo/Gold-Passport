import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { UploadFile } from "./api";

/**
 * Longest side of an uploaded photo, in pixels. Phone cameras take 12 MP and more (several MB per
 * photo), which takes minutes to send on a weak 2G/EDGE signal. At 1600 px the mine site, the gold
 * and faces stay clearly visible, and the file is typically a few hundred KB. Agree changes with the
 * business: this is the resolution kept as evidence.
 */
export const PHOTO_MAX_EDGE = 1600;
/** The ID document photo keeps more detail, so its text stays readable for the KYC check. */
export const DOCUMENT_PHOTO_MAX_EDGE = 2048;
const PHOTO_QUALITY = 0.7;

/**
 * Scales a photo down to fit `maxEdge` and saves it as JPEG. The image is downsampled while it is
 * decoded, so low-end phones never hold the full-size photo in memory.
 */
async function shrinkPhoto(uri: string, maxEdge: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri, { maxWidth: maxEdge, maxHeight: maxEdge });
  try {
    const image = await context.renderAsync();
    try {
      return (await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG })).uri;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/**
 * Takes a photo with the camera. Evidence photos are camera-only on purpose: picking from the
 * gallery would allow reusing old or someone else's pictures. The photo is made smaller before it
 * is uploaded or queued; the server hashes what it receives, so the ledger records that file.
 */
export async function takePhoto({ front = false, maxEdge = PHOTO_MAX_EDGE } = {}): Promise<UploadFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw Object.assign(new Error("Camera permission denied"), { code: "CAMERA_DENIED" });
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    // Little loss here: the photo is compressed once more when it is made smaller.
    quality: 0.9,
    exif: false,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  try {
    const uri = await shrinkPhoto(asset.uri, maxEdge);
    try {
      new File(asset.uri).delete();
    } catch {
      // The camera's copy is in the cache directory; the system clears it eventually.
    }
    return { uri, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" };
  } catch {
    // Out of memory or an unreadable format: better a large photo than none.
    return {
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    };
  }
}

/** Lab reports may be PDFs or photos. */
export async function pickDocument(): Promise<UploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png"],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const a = result.assets[0];
  return { uri: a.uri, name: a.name, type: a.mimeType ?? "application/pdf" };
}
