/**
 * Audio Converter Utility
 * Converts audio formats using ffmpeg for WhatsApp compatibility
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get ffmpeg path from ffmpeg-static
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (e) {
  // Fallback to system ffmpeg
  ffmpegPath = 'ffmpeg';
}

/**
 * Converts any audio buffer to MP3 format for WhatsApp compatibility
 * FFmpeg auto-detects the input format, so this works with webm, m4a, mp4, etc.
 * MP3 has the best compatibility with WhatsApp across all devices
 * @param {Buffer} inputBuffer - Input audio buffer (any format FFmpeg supports)
 * @returns {Promise<Buffer>} - Converted audio buffer (mp3)
 */
async function convertWebmToOgg(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    // Use generic extension - FFmpeg will auto-detect the actual format
    const inputPath = path.join(tempDir, `input_${Date.now()}.audio`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.mp3`);

    console.log(`🔄 Convirtiendo audio a MP3...`);
    console.log(`   Input size: ${(inputBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   FFmpeg path: ${ffmpegPath}`);

    // Write input buffer to temp file
    fs.writeFileSync(inputPath, inputBuffer);

    // FFmpeg arguments for converting to MP3 (most compatible format)
    const args = [
      '-i', inputPath,           // Input file
      '-c:a', 'libmp3lame',      // Use MP3 codec (best compatibility)
      '-b:a', '128k',            // Bitrate (good quality for voice)
      '-ar', '44100',            // Sample rate (standard for MP3)
      '-ac', '1',                // Mono (voice notes are mono)
      '-y',                      // Overwrite output
      outputPath                 // Output file
    ];

    const ffmpeg = spawn(ffmpegPath, args);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      // Clean up input file
      try {
        fs.unlinkSync(inputPath);
      } catch (e) {
        console.warn('   ⚠️ Could not delete temp input file:', e.message);
      }

      if (code === 0) {
        try {
          const outputBuffer = fs.readFileSync(outputPath);
          console.log(`   ✅ Conversión exitosa. Output size: ${(outputBuffer.length / 1024).toFixed(2)} KB`);

          // Clean up output file
          fs.unlinkSync(outputPath);

          resolve(outputBuffer);
        } catch (readError) {
          reject(new Error(`Error leyendo archivo convertido: ${readError.message}`));
        }
      } else {
        // Clean up output file if it exists
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch (e) {
          // Ignore cleanup errors
        }

        console.error(`   ❌ FFmpeg error (code ${code}):`);
        console.error(stderr);
        reject(new Error(`FFmpeg falló con código ${code}: ${stderr.substring(0, 200)}`));
      }
    });

    ffmpeg.on('error', (err) => {
      // Clean up files
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      console.error('   ❌ FFmpeg spawn error:', err.message);
      reject(new Error(`Error ejecutando FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Converts audio buffer to MP3 format (alternative for broader compatibility)
 * @param {Buffer} inputBuffer - Input audio buffer
 * @param {string} inputFormat - Input format (e.g., 'webm')
 * @returns {Promise<Buffer>} - Converted audio buffer (mp3)
 */
async function convertToMp3(inputBuffer, inputFormat = 'webm') {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${Date.now()}.${inputFormat}`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.mp3`);

    console.log(`🔄 Convirtiendo audio ${inputFormat} a mp3...`);

    // Write input buffer to temp file
    fs.writeFileSync(inputPath, inputBuffer);

    const args = [
      '-i', inputPath,
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '1',
      '-y',
      outputPath
    ];

    const ffmpeg = spawn(ffmpegPath, args);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      try { fs.unlinkSync(inputPath); } catch (e) {}

      if (code === 0) {
        try {
          const outputBuffer = fs.readFileSync(outputPath);
          console.log(`   ✅ Conversión a MP3 exitosa. Output size: ${(outputBuffer.length / 1024).toFixed(2)} KB`);
          fs.unlinkSync(outputPath);
          resolve(outputBuffer);
        } catch (readError) {
          reject(new Error(`Error leyendo archivo convertido: ${readError.message}`));
        }
      } else {
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
        reject(new Error(`FFmpeg falló con código ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (e) {}
      reject(new Error(`Error ejecutando FFmpeg: ${err.message}`));
    });
  });
}

module.exports = {
  convertWebmToOgg,
  convertToMp3
};
