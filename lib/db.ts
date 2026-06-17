import { createHmac, randomBytes } from 'crypto';

export interface User {
  id: string;
  email: string;
  fullName: string;
  title: string;
  role: 'admin' | 'user';
  isApprovedByAdmin: boolean;
  isRejectedByAdmin: boolean;
  canSeeOthersFiles: boolean;
  appSecret: string;
  isFirstLogin: boolean;
  connectionId: string;
  isOnline: boolean;
  lastActive: string;
  createdAt: string;
}

export interface SignalRequest {
  id: string;
  fromId: string;
  fromName: string;
  fromDeskId: string;
  toId: string;
  toDeskId: string;
  type: 'request_screen' | 'offer' | 'answer' | 'ice_candidate' | 'disconnect';
  status: 'pending' | 'accepted' | 'rejected' | 'connected' | 'completed';
  payload?: any;
  createdAt: number;
}

// Global in-memory states (persists in-process on Cloud Run container)
const activePeers: Map<string, User> = new Map();
let activeSignals: SignalRequest[] = [];

const JWT_SECRET = process.env.GEMINI_API_KEY || 'local_fallback_secret_key_2026_secure';

export function signToken(payload: { userId: string; role: 'admin' | 'user'; email: string }): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  
  const expireTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
  const encodedPayload = Buffer.from(JSON.stringify({ ...payload, exp: expireTime, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', JWT_SECRET).update(signatureInput).digest('base64url');
  return `${signatureInput}.${signature}`;
}

export function verifyToken(token: string): { userId: string; role: 'admin' | 'user'; email: string } | null {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;
    
    const signatureInput = `${header}.${payload}`;
    const expectedSignature = createHmac('sha256', JWT_SECRET).update(signatureInput).digest('base64url');
    if (signature !== expectedSignature) return null;
    
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.exp && Math.floor(Date.now() / 1000) > decoded.exp) {
      return null;
    }
    return decoded;
  } catch (e) {
    return null;
  }
}

// Clean inactive peers (no poll in 10 minutes to support background tabs and cellular latency) and expired signals (older than 3 minutes)
function purgeStaleData() {
  const now = Date.now();
  
  // Clean peers
  for (const [id, peer] of activePeers.entries()) {
    const lastActiveTime = new Date(peer.lastActive).getTime();
    if (now - lastActiveTime > 600000) { // 10 minutes
      activePeers.delete(id);
    }
  }

  // Clean signals
  const expiredSignalCutoff = now - 3 * 60 * 1000;
  activeSignals = activeSignals.filter(s => s.createdAt > expiredSignalCutoff);
}

export const DbService = {
  getUsers: (): User[] => {
    purgeStaleData();
    const now = Date.now();
    return Array.from(activePeers.values()).map(peer => {
      const lastActiveTime = new Date(peer.lastActive).getTime();
      return {
        ...peer,
        isOnline: now - lastActiveTime < 15000 // Show online if active within last 15s
      };
    });
  },

  getUserById: (id: string): User | null => {
    purgeStaleData();
    const peer = activePeers.get(id);
    if (!peer) return null;
    const now = Date.now();
    const lastActiveTime = new Date(peer.lastActive).getTime();
    return {
      ...peer,
      isOnline: now - lastActiveTime < 15000
    };
  },

  getUserByEmail: (email: string): User | null => {
    purgeStaleData();
    const normalized = email.trim().toLowerCase();
    const now = Date.now();
    for (const peer of activePeers.values()) {
      if (peer.email.toLowerCase() === normalized) {
        const lastActiveTime = new Date(peer.lastActive).getTime();
        return {
          ...peer,
          isOnline: now - lastActiveTime < 15000
        };
      }
    }
    return null;
  },

  getUserByDeskId: (deskId: string): User | null => {
    purgeStaleData();
    const normalized = deskId.trim();
    const now = Date.now();
    for (const peer of activePeers.values()) {
      if (peer.connectionId === normalized) {
        const lastActiveTime = new Date(peer.lastActive).getTime();
        return {
          ...peer,
          isOnline: now - lastActiveTime < 15000
        };
      }
    }
    return null;
  },

  // Anonymous user login/presence update (No registration necessary!)
  registerAnonymousUser: (connectionId: string, fullName: string): User => {
    purgeStaleData();
    const cleanId = connectionId.trim();
    const cleanName = fullName.trim() || `Korisnik ${cleanId.slice(-3)}`;

    const user: User = {
      id: cleanId,
      email: `${cleanId.replace(/\s+/g, '')}@zcale.internal`,
      fullName: cleanName,
      title: 'Zaposleni',
      role: 'user',
      isApprovedByAdmin: true,
      isRejectedByAdmin: false,
      canSeeOthersFiles: false,
      appSecret: '000000',
      isFirstLogin: false,
      connectionId: cleanId,
      isOnline: true,
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    activePeers.set(cleanId, user);
    return user;
  },

  updateUser: (id: string, updates: Partial<Omit<User, 'id' | 'email'>>): User | null => {
    purgeStaleData();
    const peer = activePeers.get(id);
    if (!peer) return null;

    const updated = {
      ...peer,
      ...updates,
      lastActive: new Date().toISOString()
    };
    activePeers.set(id, updated);
    return updated;
  },

  // Keep signaling fully active in-memory
  getSignals: (userId: string): SignalRequest[] => {
    purgeStaleData();
    return activeSignals.filter(s => s.toId === userId || s.fromId === userId);
  },

  addSignal: (signal: Omit<SignalRequest, 'id' | 'createdAt'>): SignalRequest => {
    purgeStaleData();
    const newSignal: SignalRequest = {
      ...signal,
      id: randomBytes(12).toString('hex'),
      createdAt: Date.now()
    };
    activeSignals.push(newSignal);
    return newSignal;
  },

  updateSignal: (signalId: string, updates: Partial<Pick<SignalRequest, 'status' | 'payload'>>): boolean => {
    purgeStaleData();
    const index = activeSignals.findIndex(s => s.id === signalId);
    if (index === -1) return false;
    activeSignals[index] = {
      ...activeSignals[index],
      ...updates
    };
    return true;
  },

  clearSignalsForUser: (userId: string): void => {
    activeSignals = activeSignals.filter(s => s.fromId !== userId && s.toId !== userId);
  }
};
