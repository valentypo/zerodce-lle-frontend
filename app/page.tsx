'use client';

import { useEffect, useRef, useState } from 'react';

interface ProcessingStats {
  fps: number;
  processingTime: number;
  frameCount: number;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isComparingRef = useRef(false);  // For closure access to comparison state
  
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [stats, setStats] = useState<ProcessingStats>({
    fps: 0,
    processingTime: 0,
    frameCount: 0,
  });
  const [error, setError] = useState<string | null>(null);
  
  const frameCountRef = useRef(0);
  const lastStatsTimeRef = useRef(Date.now());

  // Keep isComparingRef in sync with isComparing state
  useEffect(() => {
    isComparingRef.current = isComparing;
  }, [isComparing]);


  // ========================================================================
  // WEBSOCKET CONNECTION
  // ========================================================================

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/enhance`;
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log('✓ Connected to Zero-DCE server');
          setIsConnected(true);
          setError(null);
        };
        
        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);
            
            if (response.type === 'enhanced' && displayCanvasRef.current) {
              // If in comparison mode, skip rendering enhanced image (show original camera instead)
              if (isComparingRef.current) {
                frameCountRef.current++;
                return;
              }
              
              const img = new Image();
              img.onload = () => {
                const ctx = displayCanvasRef.current?.getContext('2d');
                if (ctx && displayCanvasRef.current) {
                  ctx.drawImage(img, 0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
                }
              };
              img.src = response.image;
              
              // Update stats
              frameCountRef.current++;
              const now = Date.now();
              const elapsed = now - lastStatsTimeRef.current;
              
              if (elapsed >= 1000) {
                const fps = (frameCountRef.current / elapsed) * 1000;
                setStats({
                  fps: Math.round(fps * 10) / 10,
                  processingTime: response.processing_time_ms,
                  frameCount: response.frame_count,
                });
                frameCountRef.current = 0;
                lastStatsTimeRef.current = now;
              }
            } else if (response.type === 'error') {
              console.error('Server error:', response.message);
              setError(response.message);
            }
          } catch (e) {
            console.error('Error parsing response:', e);
          }
        };
        
        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setError('Connection error - is the backend running on port 8000?');
          setIsConnected(false);
        };
        
        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          setIsStreaming(false);
          // Attempt reconnection after 3 seconds
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };
        
        wsRef.current = ws;
      } catch (e) {
        console.error('Failed to create WebSocket:', e);
        setError(String(e));
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);


  // ========================================================================
  // CAMERA & STREAMING
  // ========================================================================

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsStreaming(true);
          startFrameCapture();
        };
      }
      setError(null);
    } catch (err) {
      setError('Failed to access camera: ' + String(err));
      setIsStreaming(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
    setIsStreaming(false);
  };

  const startFrameCapture = () => {
    const video = videoRef.current;
    const hiddenCanvas = hiddenCanvasRef.current;
    const displayCanvas = displayCanvasRef.current;
    
    if (!video || !hiddenCanvas || !displayCanvas) {
      console.error('Missing required elements for frame capture');
      return;
    }

    // Reduced resolution for faster processing (from 1280x720 to 640x360)
    const CAPTURE_WIDTH = 640;
    const CAPTURE_HEIGHT = 360;
    const JPEG_QUALITY = 0.6; // Lower quality = faster encoding (was 0.85)
    
    hiddenCanvas.width = CAPTURE_WIDTH;
    hiddenCanvas.height = CAPTURE_HEIGHT;
    displayCanvas.width = CAPTURE_WIDTH;
    displayCanvas.height = CAPTURE_HEIGHT;
    
    console.log(`Frame capture started: ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT} @ ${JPEG_QUALITY * 100}% quality`);

    let frameSkip = 0;
    const FRAME_SKIP_RATE = 0; // 0 = every frame, 1 = every other frame, etc

    const captureFrame = () => {
      // Check if we're still streaming
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
      
      const ctx = hiddenCanvas.getContext('2d');
      const displayCtx = displayCanvas.getContext('2d');
      
      if (!ctx || !displayCtx) {
        console.error('Failed to get canvas context');
        return;
      }
      
      try {
        // Frame skipping to reduce load
        if (frameSkip < FRAME_SKIP_RATE) {
          frameSkip++;
          requestAnimationFrame(captureFrame);
          return;
        }
        frameSkip = 0;

        // Draw video frame to hidden canvas (scaled down)
        ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
        
        // If in comparison mode, also show original on display canvas
        if (isComparingRef.current) {
          displayCtx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
          // Add comparison label
          displayCtx.fillStyle = '#FF1493';
          displayCtx.font = 'bold 14px monospace';
          displayCtx.fillText('ORIGINAL', 10, 25);
        }
        
        // Get image data as base64 JPEG with low quality
        const imageData = hiddenCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
        
        // Send to server if WebSocket is open
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'frame',
            image: imageData
          }));
        }
      } catch (e) {
        console.error('Error during frame capture:', e);
      }
      
      requestAnimationFrame(captureFrame);
    };
    
    captureFrame();
  };


  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-2 neon-text">
          ZERO-DCE
        </h1>
        <p className="text-cyberpunk-cyan text-sm md:text-base opacity-80">
          Real-Time Low-Light Image Enhancement
        </p>
      </div>

      {/* Connection Status */}
      <div className="mb-6 flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-cyberpunk-cyan pulse-neon' : 'bg-red-500'}`} />
        <span className={`text-sm font-mono ${isConnected ? 'text-cyberpunk-cyan' : 'text-red-500'}`}>
          {isConnected ? 'CONNECTED' : 'CONNECTING...'}
        </span>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-900 border border-red-500 rounded text-red-200 max-w-md text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-2xl">
        {/* Display Canvas */}
        <div className="relative mb-8 glass rounded-lg overflow-hidden shadow-neon-lg">
          <canvas
            ref={displayCanvasRef}
            width={1280}
            height={720}
            className="w-full bg-black"
          />
          
          {/* Overlay Indicators */}
          <div className="absolute top-4 left-4 text-cyberpunk-cyan text-xs font-mono">
            <div className="mb-2">{isStreaming ? '▶ STREAMING' : '■ IDLE'}</div>
            <div>FPS: {stats.fps}</div>
            <div>LAT: {stats.processingTime.toFixed(1)}ms</div>
          </div>
          
          {/* Comparison Label */}
          {isComparing && (
            <div className="absolute top-4 right-4 text-cyberpunk-pink text-xs font-mono px-3 py-1 border border-cyberpunk-pink">
              COMPARISON MODE
            </div>
          )}
        </div>

        {/* Hidden Video & Canvas Elements */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
        />
        <canvas ref={hiddenCanvasRef} className="hidden" />

        {/* Control Buttons */}
        <div className="flex gap-3 justify-center mb-8 flex-wrap">
          <button
            onClick={startCamera}
            disabled={isStreaming || !isConnected}
            className="px-6 py-3 bg-cyberpunk-cyan text-black font-semibold rounded border border-cyberpunk-cyan
                       hover:shadow-neon hover:bg-cyberpunk-blue transition disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-2"
          >
            <span>▶</span> START STREAM
          </button>
          
          <button
            onClick={stopCamera}
            disabled={!isStreaming}
            className="px-6 py-3 bg-transparent text-cyberpunk-cyan font-semibold rounded border border-cyberpunk-cyan
                       hover:bg-cyberpunk-cyan hover:text-black transition disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-2"
          >
            <span>■</span> STOP STREAM
          </button>

          <button
            onMouseDown={() => setIsComparing(true)}
            onMouseUp={() => setIsComparing(false)}
            onMouseLeave={() => setIsComparing(false)}
            disabled={!isStreaming}
            className="px-6 py-3 bg-transparent text-cyberpunk-pink font-semibold rounded border border-cyberpunk-pink
                       hover:bg-cyberpunk-pink hover:text-black transition disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-2"
          >
            <span>↔</span> COMPARE
          </button>
        </div>

        {/* Stats Panel */}
        <div className="glass rounded-lg p-4 text-center text-sm font-mono space-y-2">
          <div>
            <span className="text-cyberpunk-blue">FRAMES:</span>{' '}
            <span className="text-cyberpunk-cyan">{stats.frameCount}</span>
          </div>
          <div>
            <span className="text-cyberpunk-blue">AVG LATENCY:</span>{' '}
            <span className="text-cyberpunk-cyan">{stats.processingTime.toFixed(1)}ms</span>
          </div>
          <div>
            <span className="text-cyberpunk-blue">STATUS:</span>{' '}
            <span className={isStreaming ? 'text-green-400' : 'text-yellow-400'}>
              {isStreaming ? 'ENHANCING' : 'READY'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-xs text-cyberpunk-cyan opacity-60 font-mono">
        <p>Zero-DCE Real-Time Enhancement Engine</p>
        <p className="mt-1">WebSocket API • PyTorch Backend</p>
      </div>
    </div>
  );
}
