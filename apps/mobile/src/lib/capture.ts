import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { UploadFile } from "./api";

/**
 * Takes a photo with the camera. Evidence photos are camera-only on purpose: picking from the
 * gallery would allow reusing old or someone else's pictures.
 */
export async function takePhoto(front = false): Promise<UploadFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw Object.assign(new Error("Camera permission denied"), { code: "CAMERA_DENIED" });
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    exif: false,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
    type: asset.mimeType ?? "image/jpeg",
  };
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
