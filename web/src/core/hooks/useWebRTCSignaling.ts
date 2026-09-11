/**
 * WebRTC Signaling Hook
 * Handles communication with the Netlify signaling server for auto-reconnection
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
  roomId: string;
  peerId: string;
  peerName?: string;
  role?: 'lead' | 'scout';
  targetPeerId?: string; // Optional: specify which peer should receive this message
  data?: unknown;
}

interface UseWebRTCSignalingOptions {
  roomId: string | null;
  peerId: string;
  peerName: string;
  role: 'lead' | 'scout';
  enabled: boolean;
  onMessage?: (message: SignalingMessage) => void;
}

export function useWebRTCSignaling({
  roomId,
  peerId,
  peerName,
  role,
  enabled,
  onMessage,
}: UseWebRTCSignalingOptions) {
  const BASE_POLL_INTERVAL_MS = 2000;
  const MAX_POLL_INTERVAL_MS = 15000;

  console.log('🎣 useWebRTCSignaling hook called:', { roomId, peerId, peerName, role, enabled });

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);
  const currentPollIntervalRef = useRef(BASE_POLL_INTERVAL_MS);
  const functionsAvailableRef = useRef<boolean | null>(null);

  // Determine the signaling server URL
  // Use absolute URL to ensure it works across devices on the network
  const signalingUrl = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:8888/.netlify/functions/webrtc-signal`
    : '/.netlify/functions/webrtc-signal';

  // Send a message to the signaling server
  const sendMessage = useCallback(
    async (message: Omit<SignalingMessage, 'roomId' | 'peerId' | 'peerName' | 'role'>) => {
      console.log(`📤 sendMessage called: ${message.type}, roomId=${roomId}, enabled=${enabled}`);

      if (!roomId || !enabled) {
        console.warn(`⚠️ sendMessage aborted: roomId=${roomId}, enabled=${enabled}`);
        return;
      }

      try {
        console.log(`🌐 Fetching ${signalingUrl} with ${message.type}`);
        const response = await fetch(signalingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...message,
            roomId,
            peerId,
            peerName,
            role,
          }),
        });

        console.log(`📨 Response: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          throw new Error(`Signaling failed: ${response.statusText}`);
        }

        // Keep polling responsive right after outbound signaling activity
        currentPollIntervalRef.current = BASE_POLL_INTERVAL_MS;

        return await response.json();
      } catch (err) {
        console.error('Failed to send signaling message:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
        throw err;
      }
    },
    [roomId, peerId, peerName, role, enabled, signalingUrl]
  );

  // Join the room
  const join = useCallback(async () => {
    if (!roomId || !enabled) return;

    try {
      // Check if functions are available (first time only)
      if (functionsAvailableRef.current === null) {
        try {
          const testResponse = await fetch(signalingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ping' }),
          });
          functionsAvailableRef.current = testResponse.status !== 404;
        } catch {
          functionsAvailableRef.current = false;
        }

        if (!functionsAvailableRef.current) {
          const devError = 'Netlify Functions not available. Please run with "npm run dev" instead of "npm run dev:vite" to enable room code connections.';
          console.error('❌', devError);
          setError(devError);
          setConnected(false);
          return;
        }
      }

      console.log('📤 Sending join message to room:', roomId);
      await sendMessage({ type: 'join' });
      console.log('✅ Join message sent successfully');
      setConnected(true);
      setError(null);
    } catch (err) {
      console.error('❌ Failed to join room:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to join room';
      setError(errorMsg);
      setConnected(false);
    }
  }, [roomId, enabled, sendMessage, signalingUrl]);

  // Leave the room
  const leave = useCallback(async () => {
    if (!roomId) return;

    try {
      await sendMessage({ type: 'leave' });
      setConnected(false);
    } catch (err) {
      console.error('Failed to leave room:', err);
    }
  }, [roomId, sendMessage]);

  // Send offer
  const sendOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, targetPeerId?: string) => {
      return sendMessage({ type: 'offer', data: offer, targetPeerId });
    },
    [sendMessage]
  );

  // Send answer
  const sendAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit, targetPeerId?: string) => {
      return sendMessage({ type: 'answer', data: answer, targetPeerId });
    },
    [sendMessage]
  );

  // Send ICE candidate
  const sendIceCandidate = useCallback(
    async (candidate: RTCIceCandidate, targetPeerId?: string) => {
      return sendMessage({ type: 'ice-candidate', data: candidate.toJSON(), targetPeerId });
    },
    [sendMessage]
  );

  // Poll for messages
  const poll = useCallback(async () => {
    if (!roomId || !enabled || !connected) {
      // console.log('⏸️ Poll skipped: roomId=${roomId}, enabled=${enabled}, connected=${connected}');
      return;
    }

    if (document.hidden || !navigator.onLine || pollInFlightRef.current) {
      return;
    }

    pollInFlightRef.current = true;

    // console.log(`🔄 Polling room ${roomId} as ${peerId.substring(0, 8)}...`);

    try {
      const response = await fetch(
        `${signalingUrl}?roomId=${roomId}&peerId=${peerId}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`Polling failed: ${response.statusText}`);
      }

      const data = await response.json();

      // console.log(`📬 Poll result: ${data.messages?.length || 0} messages`);

      // Process new messages
      if (data.messages && Array.isArray(data.messages)) {
        const messageCount = data.messages.length;

        if (data.messages.length > 0) {
          console.log(`📨 Received ${data.messages.length} messages:`, data.messages.map((m: { type: string; peerName?: string }) => `${m.type} from ${m.peerName}`).join(', '));
        }
        for (const message of data.messages) {
          // Process all messages from the server without client-side deduplication
          // The server already handles message delivery tracking, so if we received it,
          // it's a new message that should be processed
          console.log(`✅ Processing message: ${message.type} from ${message.peerName || message.peerId}`);
          onMessage?.(message);
        }

        currentPollIntervalRef.current = messageCount > 0
          ? BASE_POLL_INTERVAL_MS
          : Math.min(MAX_POLL_INTERVAL_MS, Math.floor(currentPollIntervalRef.current * 1.5));
      }
    } catch (err) {
      // Polling errors are expected when disconnecting, only log in dev
      if (import.meta.env.DEV) {
        console.error('Polling error:', err);
      }

      currentPollIntervalRef.current = Math.min(
        MAX_POLL_INTERVAL_MS,
        Math.floor(currentPollIntervalRef.current * 2)
      );

      // Don't set error state for polling failures, just log them
    } finally {
      pollInFlightRef.current = false;
    }
  }, [roomId, peerId, enabled, connected, signalingUrl, onMessage]);

  // Start polling when connected
  useEffect(() => {
    if (connected && enabled) {
      let cancelled = false;

      currentPollIntervalRef.current = BASE_POLL_INTERVAL_MS;

      const scheduleNextPoll = () => {
        if (cancelled) return;

        if (pollingTimerRef.current) {
          clearTimeout(pollingTimerRef.current);
        }

        pollingTimerRef.current = setTimeout(async () => {
          await poll();
          scheduleNextPoll();
        }, currentPollIntervalRef.current);
      };

      // Poll immediately once, then continue with adaptive interval
      poll().finally(scheduleNextPoll);

      return () => {
        cancelled = true;
        pollInFlightRef.current = false;
        if (pollingTimerRef.current) {
          clearTimeout(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
      };
    }
    return undefined;
  }, [connected, enabled, poll]);

  // Poll immediately when page becomes visible or focused again
  useEffect(() => {
    if (!connected || !enabled) return;

    const refreshPolling = () => {
      if (!document.hidden && navigator.onLine) {
        currentPollIntervalRef.current = BASE_POLL_INTERVAL_MS;
        void poll();
      }
    };

    document.addEventListener('visibilitychange', refreshPolling);
    window.addEventListener('focus', refreshPolling);
    window.addEventListener('online', refreshPolling);

    return () => {
      document.removeEventListener('visibilitychange', refreshPolling);
      window.removeEventListener('focus', refreshPolling);
      window.removeEventListener('online', refreshPolling);
    };
  }, [connected, enabled, poll]);

  // Join on mount if enabled
  const hasJoinedRef = useRef(false);
  const currentRoomRef = useRef<string | null>(null);
  const enabledRef = useRef(enabled);
  const roomIdRef = useRef(roomId);

  // Update refs on every render
  useEffect(() => {
    enabledRef.current = enabled;
    roomIdRef.current = roomId;
  });

  useEffect(() => {
    console.log('📡 Signaling hook effect:', { enabled, roomId, hasJoined: hasJoinedRef.current, currentRoom: currentRoomRef.current });

    if (enabled && roomId) {
      // Only join if we haven't joined this room yet
      if (!hasJoinedRef.current || currentRoomRef.current !== roomId) {
        console.log('🚀 Joining room:', roomId);
        hasJoinedRef.current = true;
        currentRoomRef.current = roomId;
        join();
      } else {
        console.log('✅ Already joined room:', roomId);
      }
    } else {
      console.log('⏸️ Signaling disabled or no room');
    }

    // Leave when disabled or room changes or unmounting
    return () => {
      // Use refs to get the LATEST values, not the captured ones from closure
      const currentEnabled = enabledRef.current;
      const currentRoomId = roomIdRef.current;
      console.log('🧹 Signaling cleanup:', { currentEnabled, currentRoomId, hasJoined: hasJoinedRef.current, currentRoom: currentRoomRef.current });

      // Only leave if actually disabled or room changed
      if (hasJoinedRef.current && (!currentEnabled || currentRoomRef.current !== currentRoomId)) {
        console.log('👋 Leaving room in cleanup');
        hasJoinedRef.current = false;
        currentRoomRef.current = null;
        leave();
      } else {
        console.log('✅ Keeping connection alive (still enabled and same room)');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId]); // join/leave intentionally omitted to prevent loop

  return {
    connected,
    error,
    join,
    leave,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
  };
}
