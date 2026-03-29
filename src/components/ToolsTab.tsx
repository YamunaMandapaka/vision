import React, { useCallback, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { useRunAnywhere, VideoCapture } from "@runanywhere/web";
import { motion, AnimatePresence } from "framer-motion";

const VisionTab = () => {
  const { startSession, isStarting } = useRunAnywhere({
    preferLocal: true,
  });

  const [cameraActive, setCameraActive] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const videoMountRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<VideoCapture | null>(null);

  // ================================
  // FIXED CAMERA FUNCTION (SAFE MODE)
  // ================================
  const startCamera = useCallback(async () => {
    if (captureRef.current?.isCapturing) return;

    setError(null);

    try {
      let cam: VideoCapture | null = null;

      // Try back camera first
      try {
        cam = new VideoCapture({
          video: { facingMode: { exact: "environment" } },
        });
        await cam.start();
      } catch {
        // Try front camera
        try {
          cam = new VideoCapture({
            video: { facingMode: { exact: "user" } },
          });
          await cam.start();
        } catch {
          // Final fallback
          cam = new VideoCapture({ video: true });
          await cam.start();
        }
      }

      captureRef.current = cam;

      const mount = videoMountRef.current;
      if (mount) {
        mount.innerHTML = "";
        const el = cam.videoElement;
        el.style.width = "100%";
        el.style.borderRadius = "12px";
        mount.appendChild(el);
      }

      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("NotAllowed")) {
        setError("Camera permission denied.");
      } else if (msg.includes("NotFound")) {
        setError("No camera found.");
      } else if (msg.includes("NotReadable")) {
        setError("Camera is being used by another application.");
      } else {
        setError("Camera error: " + msg);
      }

      console.error("Camera failure:", msg);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (captureRef.current) {
      captureRef.current.stop();
      captureRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // ================================
  // ASK QUESTION (Capture image)
  // ================================
  const handleQuickAsk = useCallback(async () => {
    if (!captureRef.current?.isCapturing) {
      setError("Start the camera first!");
      return;
    }

    try {
      setResponseText("");

      const photo = await captureRef.current.takePhoto();
      const session = await startSession();

      const response = await session.prompt({
        messages: [
          {
            role: "user",
            content: "Describe the current scene.",
            media: photo,
          },
        ],
      });

      setResponseText(response.text || "");
    } catch (err) {
      console.error(err);
      setError("Failed to process image.");
    }
  }, [startSession]);

  // ================================
  // LIVE CAMERA STREAM
  // ================================
  const handleLiveAsk = useCallback(async () => {
    if (!captureRef.current?.isCapturing) {
      setError("Start the camera first!");
      return;
    }

    try {
      setResponseText("Starting live mode...");
      const session = await startSession();

      const iterator = session.promptStreaming({
        messages: [
          {
            role: "user",
            content: "Describe what you see in real-time.",
            media: captureRef.current,
          },
        ],
      });

      setResponseText("");

      for await (const event of iterator) {
        if (event.type === "responseOutputStreamEvent") {
          setResponseText((prev) => prev + (event.delta || ""));
        }
      }
    } catch (err) {
      console.error(err);
      setError("Live processing failed.");
    }
  }, [startSession]);

  return (
    <div className="space-y-6">
      {/* Camera & Controls */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">AI Vision</h2>

        <div className="flex gap-3">
          {!cameraActive ? (
            <button
              onClick={startCamera}
              disabled={isStarting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2"
            >
              <Camera size={18} />
              Start Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-4 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2"
            >
              Stop Camera
            </button>
          )}

          <button
            onClick={startCamera}
            className="px-4 py-2 border rounded-lg flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Restart
          </button>
        </div>

        {error && (
          <div className="text-red-600 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Camera View */}
        <div
          ref={videoMountRef}
          className="w-full bg-black rounded-xl h-64 flex items-center justify-center text-white"
        >
          {!cameraActive && "Camera not started"}
        </div>

        {/* Vision Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleQuickAsk}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Ask About Image
          </button>

          <button
            onClick={handleLiveAsk}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg"
          >
            Live Camera Vision
          </button>
        </div>
      </div>

      {/* Response Box */}
      <AnimatePresence>
        {responseText && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-gray-100 rounded-lg"
          >
            <h3 className="font-semibold mb-2">AI Response</h3>
            <p className="whitespace-pre-wrap">{responseText}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VisionTab;