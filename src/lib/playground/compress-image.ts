/**
 * Client-side image compression and resizing utility.
 *
 * Converts image files (JPEG, PNG, WEBP, HEIC/HEIF) to optimized JPEG data URLs
 * before attaching them to Playground prompt payloads. Keeps base64 payloads
 * compact and fast over mobile networks while preserving visual clarity for
 * vision models (Gemini, GPT-4o, Claude).
 */

export async function fileToOptimizedDataUrl(
    file: File,
    maxDimension = 2048,
    quality = 0.85
): Promise<string> {
    // Non-images (e.g. PDF, TXT) pass through standard FileReader
    if (!file.type.startsWith('image/')) {
        return readAsStandardDataUrl(file);
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => {
            readAsStandardDataUrl(file).then(resolve).catch(() => resolve(''));
        };
        reader.onload = (e) => {
            const result = e.target?.result;
            if (typeof result !== 'string') {
                readAsStandardDataUrl(file).then(resolve).catch(() => resolve(''));
                return;
            }

            const img = new Image();
            img.onerror = () => {
                // If Canvas fails to load the image, fall back to raw dataUrl
                resolve(result);
            };
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width <= 0 || height <= 0) {
                    resolve(result);
                    return;
                }

                // Calculate scaling keeping aspect ratio
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(result);
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                // Compress to optimized JPEG
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl || result);
            };
            img.src = result;
        };
        reader.readAsDataURL(file);
    });
}

function readAsStandardDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
        reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('FileReader returned non-string'));
        };
        reader.readAsDataURL(file);
    });
}
