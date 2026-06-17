import { NextRequest, NextResponse } from 'next/server';
import { DbService, verifyToken } from '@/lib/db';

// GET /api/users (Returns all active peers)
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

    // Refresh my active state with auto session recovery if cleared
    let currentUser = DbService.getUserById(decoded.userId);
    if (!currentUser) {
      currentUser = DbService.registerAnonymousUser(decoded.userId, `Korisnik ${decoded.userId.slice(-3)}`);
    } else {
      DbService.updateUser(currentUser.id, { isOnline: true });
    }

    // Fetch active peers
    const users = DbService.getUsers().map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      title: u.title,
      role: u.role,
      connectionId: u.connectionId,
      isApprovedByAdmin: u.isApprovedByAdmin,
      isRejectedByAdmin: u.isRejectedByAdmin,
      canSeeOthersFiles: u.canSeeOthersFiles,
      isOnline: u.isOnline,
      lastActive: u.lastActive,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: 'Sistemska greška.' }, { status: 500 });
  }
}

// PATCH /api/users (Updates own display name / nickname instantly)
export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const { fullName } = body;

    if (fullName) {
      const updated = DbService.updateUser(decoded.userId, { fullName: fullName.trim() });
      return NextResponse.json({ success: true, user: updated });
    }

    return NextResponse.json({ error: 'Neispravni podaci.' }, { status: 400 });
  } catch (error) {
    console.error('Update peer name error:', error);
    return NextResponse.json({ error: 'Sistemska greška.' }, { status: 500 });
  }
}
