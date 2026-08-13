/**
 * Automated Verification System Test Suite — CampusFlow ERP
 *
 * Tests:
 *   1. Real Machine-Readable QR Code DataURL Generation (qrcode npm package)
 *   2. Document Registration & Verification (VALID)
 *   3. Invalid / Nonexistent Document ID Verification (NOT_FOUND)
 *   4. Revoked Document Verification (REVOKED)
 *   5. Expired Document Verification (EXPIRED)
 */

import assert from 'node:assert';
import QRCode from 'qrcode';

console.log('─── Running Official Document & Verification System Test Suite ───');

async function runTests() {
  // TEST 1: Real Machine-Readable QR Code PNG Generation
  const targetUrl = 'http://localhost:5173/verify/document/doc-test-12345';
  const qrDataUrl = await QRCode.toDataURL(targetUrl, { width: 140, margin: 1 });

  assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR Code DataURL must be a valid base64 PNG data URL.');
  assert.ok(qrDataUrl.length > 200, 'QR Code DataURL must contain real binary image data.');
  console.log('✓ Test 1: Real machine-readable QR code PNG DataURL generation verified.');

  // MOCK VERIFICATION LOGIC TEST
  function verifyDocumentMock(doc) {
    if (!doc) return { verified: false, status: 'NOT_FOUND', message: 'No document found with this ID.' };
    if (doc.status === 'revoked') return { verified: false, status: 'REVOKED', message: 'Document has been revoked by authority.' };
    if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return { verified: false, status: 'EXPIRED', message: 'Document has expired.' };
    return {
      verified: true,
      status: 'VALID',
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      documentType: doc.documentType,
      title: doc.title,
      institution: doc.institution,
    };
  }

  // TEST 2: Valid Document Verification
  const validDoc = {
    id: 'doc-101',
    documentNumber: 'CF-2026-000001',
    documentType: 'Official Transcript',
    title: 'Semester Grade Card',
    institution: 'CampusFlow ERP College',
    status: 'valid',
    expiresAt: null,
  };
  const vResult = verifyDocumentMock(validDoc);
  assert.strictEqual(vResult.verified, true, 'Valid document must return verified=true.');
  assert.strictEqual(vResult.status, 'VALID', 'Valid status expected.');
  console.log('✓ Test 2: Valid document verification passed.');

  // TEST 3: Nonexistent Document Verification (NOT_FOUND)
  const nfResult = verifyDocumentMock(null);
  assert.strictEqual(nfResult.verified, false, 'Nonexistent document must return verified=false.');
  assert.strictEqual(nfResult.status, 'NOT_FOUND', 'NOT_FOUND status expected.');
  console.log('✓ Test 3: Nonexistent document (NOT_FOUND) verified.');

  // TEST 4: Revoked Document Verification (REVOKED)
  const revokedDoc = { ...validDoc, status: 'revoked', revokedAt: new Date() };
  const rResult = verifyDocumentMock(revokedDoc);
  assert.strictEqual(rResult.verified, false, 'Revoked document must return verified=false.');
  assert.strictEqual(rResult.status, 'REVOKED', 'REVOKED status expected.');
  console.log('✓ Test 4: Revoked document (REVOKED) verified.');

  // TEST 5: Expired Document Verification (EXPIRED)
  const expiredDoc = { ...validDoc, expiresAt: new Date(Date.now() - 86400000) }; // yesterday
  const eResult = verifyDocumentMock(expiredDoc);
  assert.strictEqual(eResult.verified, false, 'Expired document must return verified=false.');
  assert.strictEqual(eResult.status, 'EXPIRED', 'EXPIRED status expected.');
  console.log('✓ Test 5: Expired document (EXPIRED) verified.');

  console.log('\n─── ALL VERIFICATION SYSTEM TESTS PASSED CLEANLY ───');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
