'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuthState } from './AuthProvider';

export type ConnectionState = 'idle' | 'calling' | 'receiving' | 'connected' | 'rejected' | 'disconnected';

interface IncomingRequest {
  id: string;
  fromName: string;
  fromDeskId: string;
  fromId: string;
}

interface ScreenShareContextProps {
  connectionState: ConnectionState;
  incomingRequest: IncomingRequest | null;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  partnerName: string | null;
  partnerDeskId: string | null;
  isSharingOwnScreen: boolean;
  startConnection: (targetDeskId: string) => Promise<void>;
  acceptIncomingRequest: () => Promise<void>;
  rejectIncomingRequest: () => Promise<void>;
  disconnectSession: () => Promise<void>;
}

// Google Free Public STUN Servers - compliant with free Google APIs rules
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const ScreenShareContext = createContext<ScreenShareContextProps | undefined>(undefined);

export function ScreenShareProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuthState();
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerDeskId, setPartnerDeskId] = useState<string | null>(null);
  const [isSharingOwnScreen, setIsSharingOwnScreen] = useState<boolean>(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pollingIntervalRef = useRef<any>(null);
  const activeSignalIdRef = useRef<string | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const partnerIdRef = useRef<string | null>(null);
  const partnerDeskIdRef = useRef<string | null>(null);

  // Disconnect & cleanup session resources
  const disconnectSession = useCallback(async () => {
    console.log('Disconnecting session...');
    
    // Stop all local media tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Notify peer on server
    if (token && (activeSignalIdRef.current || partnerIdRef.current)) {
      fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'create',
          toUserId: partnerIdRef.current || null,
          type: 'disconnect',
          status: 'completed'
        })
      }).catch(console.error);

      // Clear all active signals for both users
      fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'clear' })
      }).catch(console.error);
    }

    // Close PeerConnection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset local states
    setConnectionState('idle');
    setIncomingRequest(null);
    setRemoteStream(null);
    setLocalStream(null);
    setPartnerName(null);
    setPartnerDeskId(null);
    setIsSharingOwnScreen(false);
    activeSignalIdRef.current = null;
    pendingCandidatesRef.current = [];
    processedSignalIdsRef.current.clear();
    partnerIdRef.current = null;
    partnerDeskIdRef.current = null;
  }, [localStream, token]);

  // Create RTCPeerConnection helper
  const createPeerConnection = useCallback((sharing: boolean) => {
    if (typeof window === 'undefined') return null;

    console.log(`Creating RTCPeerConnection. Sharing: ${sharing}`);
    const pc = new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = (event) => {
      if (event.candidate && token && user) {
        console.log('Sending local ICE candidate...');
        fetch('/api/signaling', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'create',
            toUserId: partnerIdRef.current || undefined,
            toDeskId: partnerDeskIdRef.current || undefined,
            type: 'ice_candidate',
            status: 'connected',
            payload: event.candidate.toJSON()
          })
        }).catch(err => console.error('Error post ICE candidate', err));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer Connection State changed:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnectionState('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        disconnectSession();
      }
    };

    // Receive streaming tracks
    if (!sharing) {
      pc.ontrack = (event) => {
        console.log('Incoming remote screen share stream track detected:', event.streams);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setConnectionState('connected');
        }
      };
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [token, user, disconnectSession]);

  // Action: Initiate a Remote Connection request by typing 9-digit ID
  const startConnection = async (targetDeskId: string) => {
    if (!token || !user) return;
    setConnectionState('calling');
    setPartnerDeskId(targetDeskId);
    partnerDeskIdRef.current = targetDeskId;
    pendingCandidatesRef.current = [];

    try {
      const res = await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'create',
          toDeskId: targetDeskId,
          type: 'request_screen',
          status: 'pending'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Neuspešan pokušaj povezivanja.');
      }
      
      activeSignalIdRef.current = data.signal.id;
      partnerIdRef.current = data.signal.toId;
      // Host details
      setPartnerName('Udaljeni računar...');
    } catch (err: any) {
      setConnectionState('idle');
      throw err;
    }
  };

  // Action: Approve incoming connection request and start capture (Host side)
  const acceptIncomingRequest = async () => {
    if (!incomingRequest || !token) return;
    
    try {
      setConnectionState('connected');
      setIsSharingOwnScreen(true);
      setPartnerName(incomingRequest.fromName);
      setPartnerDeskId(incomingRequest.fromDeskId);
      
      partnerIdRef.current = incomingRequest.fromId;
      partnerDeskIdRef.current = incomingRequest.fromDeskId;
      pendingCandidatesRef.current = [];

      // 1. Capture screen display from user browser
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor', // Prefer entire monitor screen
        },
        audio: false
      });
      setLocalStream(stream);

      // Stop sharing listeners (user clicks browser native "Stop Sharing" overlay)
      stream.getVideoTracks()[0].onended = () => {
        console.log('User ended display sharing natively.');
        disconnectSession();
      };

      // 2. Initialize Peer Connection (Sharing)
      const pc = createPeerConnection(true);
      if (!pc) return;

      // 3. Attach screen tracks to RTC peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // 4. Create SDP offer
      const offer = await pc.createOffer({
        offerToReceiveVideo: false,
        offerToReceiveAudio: false
      });
      await pc.setLocalDescription(offer);

      // 5. Update remote connection request status to approved/accepted with the offer SDP payload
      await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'update',
          signalId: incomingRequest.id,
          status: 'accepted',
          payload: offer
        })
      });

      setIncomingRequest(null);
    } catch (err) {
      console.error('Error accepting and sharing screen:', err);
      // Reject or reset if screenshot cancelled/fails
      rejectIncomingRequest();
      disconnectSession();
    }
  };

  // Action: Deny incoming screen viewing request (Host side)
  const rejectIncomingRequest = async () => {
    if (!incomingRequest || !token) return;

    try {
      await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'update',
          signalId: incomingRequest.id,
          status: 'rejected'
        })
      });
    } catch (err) {
      console.error('Error rejecting signal request', err);
    } finally {
      setIncomingRequest(null);
      setConnectionState('idle');
    }
  };

  // WebRTC Signal handler (polls periodically for active handshakes)
  const pollSignalingChannel = useCallback(async () => {
    if (!token || !user) return;

    try {
      const res = await fetch('/api/signaling', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;

      const data = await res.json();
      const signals = data.signals || [];

      // Process signals
      for (const sig of signals) {
        // Skip already processed signals to avoid duplicates
        if (processedSignalIdsRef.current.has(sig.id)) continue;

        // Clean disconnect signals
        if (sig.type === 'disconnect') {
          console.log('Received remote disconnect signal.');
          disconnectSession();
          return;
        }

        // Scenario 1: Someone requests to view my screen (I am the Host / Sharer)
        if (sig.toId === user.id && sig.type === 'request_screen' && sig.status === 'pending' && connectionState === 'idle') {
          setIncomingRequest({
            id: sig.id,
            fromName: sig.fromName,
            fromDeskId: sig.fromDeskId,
            fromId: sig.fromId
          });
          setConnectionState('receiving');
          processedSignalIdsRef.current.add(sig.id);
        }

        // Scenario 2: Partner rejected my remote viewing request (Viewer gets rejection)
        if (sig.fromId === user.id && sig.type === 'request_screen' && sig.status === 'rejected' && connectionState === 'calling') {
          setConnectionState('rejected');
          setTimeout(() => setConnectionState('idle'), 5000); // Reset after 5s
          processedSignalIdsRef.current.add(sig.id);
        }

        // Scenario 3: Partner approved my viewing request (I am the Viewer / Client, receiving Offer)
        if (sig.fromId === user.id && sig.type === 'request_screen' && sig.status === 'accepted' && connectionState === 'calling') {
          processedSignalIdsRef.current.add(sig.id);
          
          setPartnerName(sig.toName || 'Udaljeni računar');
          setPartnerDeskId(sig.toDeskId);
          setIsSharingOwnScreen(false);
          
          partnerIdRef.current = sig.toId;
          partnerDeskIdRef.current = sig.toDeskId;

          // Build PeerConnection, set remote offer description and create answer
          const pc = createPeerConnection(false);
          if (!pc) return;

          const offerDesc = new RTCSessionDescription(sig.payload);
          await pc.setRemoteDescription(offerDesc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Send SDP Answer signal
          await fetch('/api/signaling', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              action: 'create',
              toUserId: sig.toId,
              type: 'answer',
              status: 'connected',
              payload: answer
            })
          });

          // Mount any buffered ICE Candidates received earlier
          while (pendingCandidatesRef.current.length > 0) {
            const cand = pendingCandidatesRef.current.shift();
            if (cand) pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
          }
        }

        // Scenario 4: Host receives SDP Answer (I am the Host / Sharer, receiving Answer)
        if (sig.toId === user.id && sig.type === 'answer' && peerConnectionRef.current && !peerConnectionRef.current.remoteDescription) {
          processedSignalIdsRef.current.add(sig.id);
          const pc = peerConnectionRef.current;
          if (pc && sig.payload) {
            console.log('Host setting remote Answer Description...');
            await pc.setRemoteDescription(new RTCSessionDescription(sig.payload));
            
            // Mount any buffered ice
            while (pendingCandidatesRef.current.length > 0) {
              const cand = pendingCandidatesRef.current.shift();
              if (cand) pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
            }
          }
        }

        // Scenario 5: Receive remote ICE Candidate of partner
        if (sig.type === 'ice_candidate' && sig.payload) {
          // Verify that this is from other person AND targeted to us
          if (sig.toId === user.id && sig.fromId === partnerIdRef.current) {
            processedSignalIdsRef.current.add(sig.id);
            const cand = sig.payload;
            const pc = peerConnectionRef.current;
            if (pc && pc.remoteDescription) {
              console.log('Adding ICE candidate directly to peer connection');
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(err => {
                console.error('Error adding received candidate', err);
              });
            } else {
              console.log('Peer Connection not ready, buffering ICE candidate');
              pendingCandidatesRef.current.push(cand);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error polling signaling server:', error);
    }
  }, [token, user, connectionState, createPeerConnection, disconnectSession]);

  // Signaling polling worker
  useEffect(() => {
    if (!token || !user) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Poll signaling queue every 1.5s for fast responses
    const t = setTimeout(() => {
      pollSignalingChannel();
    }, 0);
    pollingIntervalRef.current = setInterval(pollSignalingChannel, 1500);

    return () => {
      clearTimeout(t);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [token, user, pollSignalingChannel]);

  return (
    <ScreenShareContext.Provider value={{
      connectionState,
      incomingRequest,
      remoteStream,
      localStream,
      partnerName,
      partnerDeskId,
      isSharingOwnScreen,
      startConnection,
      acceptIncomingRequest,
      rejectIncomingRequest,
      disconnectSession
    }}>
      {children}
    </ScreenShareContext.Provider>
  );
}

export function useScreenShare() {
  const context = useContext(ScreenShareContext);
  if (!context) throw new Error('useScreenShare mora biti korišćen u okviru ScreenShareProvider-a');
  return context;
}
