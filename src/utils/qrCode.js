import QRCode from 'qrcode';

/**
 * Generate a real, machine-readable QR code as a base64 PNG DataURL.
 * Scannable by any standard phone camera or QR reader app.
 *
 * @param {string} text - Public verification URL (e.g., http://domain.com/verify/document/DOC_ID)
 * @param {object} [options]
 * @returns {Promise<string>} Base64 PNG DataURL
 */
export async function generateVerificationQR(text, options = {}) {
  if (!text) return null;

  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      width: options.width || 160,
      color: {
        dark: options.darkColor || '#1B3A6B',
        light: options.lightColor || '#FFFFFF',
      },
    });
    return dataUrl;
  } catch (err) {
    console.error('Failed to generate real QR code DataURL:', err);
    return null;
  }
}
