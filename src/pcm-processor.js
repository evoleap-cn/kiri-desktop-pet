/**
 * AudioWorklet processor for converting Float32 audio to PCM Int16 format
 * This runs in a separate audio thread for real-time processing
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array();
  }

  /**
   * Process audio samples from the input
   * @param {Float32Array[][]} inputs - Input audio channels
   * @returns {boolean} Keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0]; // First input port

    if (input.length > 0) {
      const channelData = input[0]; // Use first channel (mono)
      
      // Debug: log audio levels
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += Math.abs(channelData[i]);
      }
      const avg = sum / channelData.length;
      // if (avg > 0.01) {
      //   console.log(`[AudioWorklet] Audio level: ${avg.toFixed(4)}, samples: ${channelData.length}`);
      // }

      // Accumulate samples
      const newBuffer = new Float32Array(this.buffer.length + channelData.length);
      newBuffer.set(this.buffer);
      newBuffer.set(channelData, this.buffer.length);
      this.buffer = newBuffer;

      // Send PCM chunks when we have enough data (~100ms at 16kHz = 1600 samples)
      const samplesPerChunk = 1600;

      while (this.buffer.length >= samplesPerChunk) {
        const chunk = this.buffer.slice(0, samplesPerChunk);
        this.buffer = this.buffer.slice(samplesPerChunk);

        // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
        const pcmData = this.floatTo16BitPCM(chunk);

        // Send to main thread via message port
        this.port.postMessage(pcmData, [pcmData.buffer]); // Transferable for performance
      }
    }

    return true; // Keep processor alive
  }

  /**
   * Convert Float32 audio samples to Int16 PCM format
   * @param {Float32Array} input - Float32 samples in range [-1, 1]
   * @returns {Int16Array} PCM Int16 samples
   */
  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    
    for (let i = 0; i < input.length; i++) {
      // Clamp to [-1, 1]
      const sample = Math.max(-1, Math.min(1, input[i]));
      // Convert to Int16 range
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    
    return output;
  }
}

// Register the processor with the AudioWorklet global scope
registerProcessor('pcm-processor', PCMProcessor);
