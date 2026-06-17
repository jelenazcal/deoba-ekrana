import { NextRequest, NextResponse } from 'next/server';
import { DbService, signToken, verifyToken } from '@/lib/db';

// POST /api/auth (Anonymously authenticate with Desk ID and Name)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, connectionId, fullName } = body;

    if (!connectionId) {
      return NextResponse.json({ error: 'Nedostaje ID adresa računara.' }, { status: 400 });
    }

    const cleanId = connectionId.trim();
    const cleanName = fullName?.trim() || `Korisnik ${cleanId.slice(-3)}`;

    // Create or update this peer registry entry in memory
    const user = DbService.registerAnonymousUser(cleanId, cleanName);
    const token = signToken({ userId: user.id, role: user.role });

    return NextResponse.json({
      message: 'Prijava uspešna!',
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        title: user.title,
        role: user.role,
        connectionId: user.connectionId,
        isApprovedByAdmin: user.isApprovedByAdmin,
        isRejectedByAdmin: user.isRejectedByAdmin,
        appSecret: user.appSecret,
        isFirstLogin: user.isFirstLogin,
      }
    });
  } catch (error: any) {
    console.error('Anonymous auth POST error:', error);
    return NextResponse.json({ error: 'Greška na serveru.' }, { status: 500 });
  }
}

// GET /api/auth (Verify JWT token and return peer registry info)
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

    let user = DbService.getUserById(decoded.userId);
    if (!user) {
      // Re-register if server restarted and peer memory was cleared, utilizing decoded payload values
      user = DbService.registerAnonymousUser(decoded.userId, `Korisnik ${decoded.userId.slice(-3)}`);
    } else {
      // Keep online state tick
      DbService.updateUser(user.id, { isOnline: true });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        title: user.title,
        role: user.role,
        connectionId: user.connectionId,
        isApprovedByAdmin: user.isApprovedByAdmin,
        isRejectedByAdmin: user.isRejectedByAdmin,
        appSecret: user.appSecret,
        isFirstLogin: user.isFirstLogin,
      }
    });
  } catch (error) {
    console.error('Anonymous auth GET error:', error);
    return NextResponse.json({ error: 'Greška.' }, { status: 500 });
  }
}
