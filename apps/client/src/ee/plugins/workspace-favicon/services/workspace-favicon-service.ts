import api from "@/lib/api-client";
import loadImage from "blueimp-load-image";

const ALLOWED_FORMATS = new Set(["image/png", "image/jpeg", "image/x-icon"]);
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

export async function validateAndCompressFavicon(file: File): Promise<File> {
  // Validate MIME type
  if (!ALLOWED_FORMATS.has(file.type)) {
    throw new Error("Invalid file format. Allowed: PNG, JPG, ICO");
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 1MB limit");
  }

  // For .ico files, skip compression
  if (file.type === "image/x-icon") {
    return file;
  }

  // Compress and resize image to 64x64 for favicon
  const canvas = (
    await loadImage(file, {
      maxWidth: 64,
      maxHeight: 64,
      canvas: true,
      orientation: true,
      imageSmoothingQuality: "high",
    })
  ).image as HTMLCanvasElement;

  return new Promise<File>((resolve, reject) => {
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to compress favicon"));
          return;
        }
        resolve(new File([blob], file.name, { type: outputType }));
      },
      outputType,
      file.type === "image/png" ? undefined : 0.9,
    );
  });
}

export async function uploadWorkspaceFavicon(file: File): Promise<{ fileName: string }> {
  const compressedFile = await validateAndCompressFavicon(file);
  const formData = new FormData();
  formData.append("type", "workspace-favicon");
  formData.append("image", compressedFile);

  return await api.post("/attachments/upload-image", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

export async function getWorkspaceFavicon(): Promise<{ favicon: string | null }> {
  return await api.get("/workspaces/favicon");
}
