import { NextRequest, NextResponse } from 'next/server';
import { DbService, verifyToken } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Niste autorizovani.' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Nevažeći token.' }, { status: 401 });
    }

    let currentUser = DbService.getUserById(decoded.userId);
    if (!currentUser) {
      currentUser = DbService.registerAnonymousUser(decoded.userId, `Korisnik ${decoded.userId.slice(-3)}`);
    } else {
      // Keep user's online state updated during polling
      DbService.updateUser(currentUser.id, { isOnline: true });
    }

    const signals = DbService.getSignals(currentUser.id);

    return NextResponse.json({ signals });
  } catch (error) {
    return NextResponse.json({ error: 'Sistemska greška.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Niste autorizovani.' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Nevažeći token.' }, { status: 401 });
    }

    let currentUser = DbService.getUserById(decoded.userId);
    if (!currentUser) {
      currentUser = DbService.registerAnonymousUser(decoded.userId, `Korisnik ${decoded.userId.slice(-3)}`);
    } else {
      DbService.updateUser(currentUser.id, { isOnline: true });
    }

    const body = await req.json();
    const { action, signalId, toDeskId, toUserId, type, status, payload } = body;

    if (action === 'create') {
      let targetUser = null;
      if (toUserId) {
        targetUser = DbService.getUserById(toUserId);
      } else if (toDeskId) {
        targetUser = DbService.getUserByDeskId(toDeskId);
      }

      if (!targetUser) {
        return NextResponse.json({ error: 'Korisnik sa tim desk ID-jem nije pronađen ili je van mreže.' }, { status: 404 });
      }

      if (targetUser.id === currentUser.id) {
        return NextResponse.json({ error: 'Ne možete se povezati sami sa sobom.' }, { status: 400 });
      }

      // Add a clean signal request to target
      const signal = DbService.addSignal({
        fromId: currentUser.id,
        fromName: currentUser.fullName,
        fromDeskId: currentUser.connectionId,
        toId: targetUser.id,
        toDeskId: targetUser.connectionId,
        type: type || 'request_screen',
        status: status || 'pending',
        payload: payload || null,
      });

      return NextResponse.json({ success: true, signal });
    } else if (action === 'update') {
      if (!signalId) {
        return NextResponse.json({ error: 'Nedostaje ID signala za ažuriranje.' }, { status: 400 });
      }

      const updated = DbService.updateSignal(signalId, {
        status,
        payload,
      });

      if (!updated) {
        return NextResponse.json({ error: 'Signal nije pronađen.' }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    } else if (action === 'clear') {
      // Clear all active signals for this user (e.g. on disconnect/reset)
      DbService.clearSignalsForUser(currentUser.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Nevažeća akcija.' }, { status: 400 });
  } catch (error) {
    console.error('Signaling POST error:', error);
    return NextResponse.json({ error: 'Sistemska greška na serveru.' }, { status: 500 });
  }
}
