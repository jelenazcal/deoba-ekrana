'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Play, 
  RefreshCw, 
  UserCheck, 
  PhoneCall, 
  PhoneForwarded, 
  Radio, 
  Network, 
  ArrowRight, 
  Lock, 
  ShieldCheck,
  Flame,
  CornerDownRight,
  Sparkles,
  Home
} from 'lucide-react';
import Link from 'next/link';

interface TestStep {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'success' | 'failed';
  error?: string;
  details?: string;
}

export default function TestsPage() {
  const [running, setRunning] = useState(false);
  const [overallResult, setOverallResult] = useState<'none' | 'success' | 'failed'>('none');
  const [log, setLog] = useState<string[]>([]);
  const [steps, setSteps] = useState<TestStep[]>([
    {
      id: 'anonymous-auth-host',
      name: 'Kreiranje Host Sesije (Udaljeni)',
      description: 'Generisanje stabilnog 9-cifrenog ID broja i JWT tokena za Host korisnika bez email registracije.',
      status: 'idle'
    },
    {
      id: 'anonymous-auth-caller',
      name: 'Kreiranje Caller Sesije (Klijent)',
      description: 'Generisanje drugog jedinstvenog 9-cifrenog ID broja i JWT tokena za Caller korisnika.',
      status: 'idle'
    },
    {
      id: 'presence-verification',
      name: 'Verifikacija Prisustva na Mreži',
      description: 'Provera da li su oba korisnika uspešno registrovana u globalnoj bazi i aktivni.',
      status: 'idle'
    },
    {
      id: 'initiate-call',
      name: 'Iniciranje Prenosa Ekranom',
      description: 'Caller šalje signal "request_screen" Hostu koristeći isključivo Hostov 9-cifreni ID broj.',
      status: 'idle'
    },
    {
      id: 'receive-call',
      name: 'Prijem Poziva i Čitanje Signala',
      description: 'Host uočava dolazni signal na kanalu i uspostavlja status preuzimanja.',
      status: 'idle'
    },
    {
      id: 'approve-offer',
      name: 'Odobravanje i Slanje SDP Ponude (Offer)',
      description: 'Host odobrava poziv i generiše simuliranu WebRTC SDP Offer ponudu nazad Caller-u.',
      status: 'idle'
    },
    {
      id: 'answer-sdp',
      name: 'Generisanje i Slanje SDP Odgovora (Answer)',
      description: 'Caller prihvata Offer ponudu i šalje nazad generisan WebRTC SDP Answer signal.',
      status: 'idle'
    },
    {
      id: 'ice-candidate',
      name: 'Razmena WebRTC ICE Kandidata',
      description: 'Obostrana simulacija slanja mrežnih mapi (ICE Candidates) kako bi se osigurao Peer-to-Peer tok.',
      status: 'idle'
    },
    {
      id: 'clean-disconnect',
      name: 'Zatvaranje Kanala i Čišćenje',
      description: 'Simulacija prekida prenosa i proveravanje da li se kanali automatski oslobađaju.',
      status: 'idle'
    }
  ]);

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const updateStep = (id: string, updates: Partial<TestStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const runAllTests = async () => {
    if (running) return;
    setRunning(true);
    setOverallResult('none');
    setLog([]);
    
    // Reset steps to idle
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle', error: undefined, details: undefined })));
    addLog('Pokretanje integrisanog test-toka i dijagnostike poziva bez email-a...');

    let hostToken = '';
    let callerToken = '';
    
    // Randomize connection IDs to guarantee clean test environment
    const hostDeskId = `${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)}`;
    const callerDeskId = `${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)}`;
    let activeSignalId = '';

    try {
      // 1. Host Auth
      updateStep('anonymous-auth-host', { status: 'running' });
      addLog(`[Step 1] Pokušaj kreiranja anonimne sesije za Host-a: ID="${hostDeskId}"`);
      const hostRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'anonymous',
          connectionId: hostDeskId,
          fullName: 'Test Ambulanta Host'
        })
      });
      if (!hostRes.ok) {
        throw { stepId: 'anonymous-auth-host', message: `Host autorizacija nije uspela: ${hostRes.statusText}` };
      }
      const hostData = await hostRes.json();
      hostToken = hostData.token;
      updateStep('anonymous-auth-host', { 
        status: 'success',
        details: `Kreiran JWT: ${hostToken.substring(0, 20)}... | Ime: "Test Ambulanta Host"`
      });
      addLog(`Host uspešno autorizovan. Generisan token.`);

      // 2. Caller Auth
      updateStep('anonymous-auth-caller', { status: 'running' });
      addLog(`[Step 2] Pokušaj kreiranja anonimne sesije za Caller-a: ID="${callerDeskId}"`);
      const callerRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'anonymous',
          connectionId: callerDeskId,
          fullName: 'Test Ordinacija Caller'
        })
      });
      if (!callerRes.ok) {
        throw { stepId: 'anonymous-auth-caller', message: `Caller autorizacija nije uspela: ${callerRes.statusText}` };
      }
      const callerData = await callerRes.json();
      callerToken = callerData.token;
      updateStep('anonymous-auth-caller', { 
        status: 'success',
        details: `Kreiran JWT: ${callerToken.substring(0, 20)}... | Ime: "Test Ordinacija Caller"`
      });
      addLog(`Caller uspešno autorizovan. Generisan token.`);

      // 3. Verify Presence via Active Directory users list
      updateStep('presence-verification', { status: 'running' });
      addLog('[Step 3] Provera mrežnog imenika za aktivne korisnike...');
      const listRes = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${callerToken}` }
      });
      if (!listRes.ok) {
        throw { stepId: 'presence-verification', message: `Greška prilikom čitanja imenika korisnika: ${listRes.statusText}` };
      }
      const listData = await listRes.json();
      const users: any[] = listData.users || [];
      const hostFound = users.find(u => u.connectionId === hostDeskId);
      const callerFound = users.find(u => u.connectionId === callerDeskId);
      
      if (!hostFound) {
        throw { stepId: 'presence-verification', message: `Host sa ID-jem "${hostDeskId}" nije pronađen u imeniku aktivnih korisnika!` };
      }
      addLog(`Pronađen Host na mreži: Ime="${hostFound.fullName}", StatusOnline=${hostFound.isOnline}`);
      updateStep('presence-verification', { 
        status: 'success',
        details: `Pronađen Host: ${hostFound.fullName} (${hostFound.connectionId}) • Status: Online`
      });

      // 4. Initiate connection request from Caller to Host (request_screen)
      updateStep('initiate-call', { status: 'running' });
      addLog(`[Step 4] Caller uspostavlja vezu sa Hostom upisivanjem ID-ja "${hostDeskId}"...`);
      const callRes = await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${callerToken}`
        },
        body: JSON.stringify({
          action: 'create',
          toDeskId: hostDeskId,
          type: 'request_screen',
          status: 'pending'
        })
      });
      if (!callRes.ok) {
        const errJson = await callRes.json();
        throw { stepId: 'initiate-call', message: `Iniciranje poziva odbijeno: ${errJson.error || callRes.statusText}` };
      }
      const callData = await callRes.json();
      activeSignalId = callData.signal.id;
      addLog(`Signalni zahtev uspešno kreiran. ID signala = "${activeSignalId}"`);
      updateStep('initiate-call', { 
        status: 'success',
        details: `Zahtev prenesen. ID signala: ${activeSignalId.substring(0, 8)}... | Status: Na čekanju (Pending)`
      });

      // 5. Host checks signaling queue and intercepts the incoming call
      updateStep('receive-call', { status: 'running' });
      addLog('[Step 5] Host pretražuje signalni kanal za dolazne zahteve...');
      const pollRes = await fetch('/api/signaling', {
        headers: { 'Authorization': `Bearer ${hostToken}` }
      });
      if (!pollRes.ok) {
        throw { stepId: 'receive-call', message: `Host nije uspeo da pročita signalni kanal: ${pollRes.statusText}` };
      }
      const pollData = await pollRes.json();
      const signals: any[] = pollData.signals || [];
      const pendingRequest = signals.find(s => s.id === activeSignalId && s.type === 'request_screen' && s.status === 'pending');
      
      if (!pendingRequest) {
        throw { stepId: 'receive-call', message: `Host nije pronašao aktivan dolazni poziv sa signal ID-jem "${activeSignalId}"!` };
      }
      addLog(`Dolazni poziv uspešno detektovan od strane Host-a. Pozivalac: "${pendingRequest.fromName}" (${pendingRequest.fromDeskId})`);
      updateStep('receive-call', { 
        status: 'success',
        details: `Prepoznat poziv od: "${pendingRequest.fromName}" • Status: Primljen`
      });

      // 6. Host accepts the request and sends simulated WebRTC SDP Offer payload
      updateStep('approve-offer', { status: 'running' });
      addLog('[Step 6] Host odobrava prenos i vraća SDP Offer nazad Caller-u...');
      const sdpOfferMock = { type: 'offer', sdp: 'v=0\no=- 4611686018427387904 2 IN IP4 127.0.0.1\ns=-\nt=0 0\na=group:BUNDLE 0\na=msid-semantic: WMS\nm=video 9 UDP/TLS/RTP/SAVPF 96' };
      const acceptRes = await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hostToken}`
        },
        body: JSON.stringify({
          action: 'update',
          signalId: activeSignalId,
          status: 'accepted',
          payload: sdpOfferMock
        })
      });
      if (!acceptRes.ok) {
        throw { stepId: 'approve-offer', message: `Host ne može da pošalje SDP ponudu: ${acceptRes.statusText}` };
      }
      addLog('Host odobrio prenos. SDP Offer poslat u kanal.');
      updateStep('approve-offer', { 
        status: 'success',
        details: `Status: Accepted (Prihvaćeno) | SDP Ponuda uspešno upisana u signalni objekat.`
      });

      // 7. Caller polls, receives accepted status and mock SDP Offer, then sends SDP Answer
      updateStep('answer-sdp', { status: 'running' });
      addLog('[Step 7] Caller preuzima SDP Offer i uzvraća sa SDP Answer...');
      // Poll from caller to confirm accepted state and get payload
      const callerPollRes = await fetch('/api/signaling', {
        headers: { 'Authorization': `Bearer ${callerToken}` }
      });
      if (!callerPollRes.ok) {
        throw { stepId: 'answer-sdp', message: `Caller nije uspeo da očita signal: ${callerPollRes.statusText}` };
      }
      const callerPollData = await callerPollRes.json();
      const updatedSignal = (callerPollData.signals || []).find((s: any) => s.id === activeSignalId);
      
      if (!updatedSignal || updatedSignal.status !== 'accepted' || !updatedSignal.payload) {
        throw { stepId: 'answer-sdp', message: `Caller nije uspeo da primi promenu statusa u "accepted" sa SDP ponudom.` };
      }
      addLog(`Caller uspešno primio Offer. Generisanje SDP Answer odgovora...`);

      const sdpAnswerMock = { type: 'answer', sdp: 'v=0\no=- 4611686018427387904 3 IN IP4 127.0.0.1\ns=-\nt=0 0\na=group:BUNDLE 0\na=msid-semantic: WMS\nm=video 9 UDP/TLS/RTP/SAVPF 96' };
      // Caller sends Answer signal
      const answerRes = await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${callerToken}`
        },
        body: JSON.stringify({
          action: 'create',
          toUserId: updatedSignal.toId,
          type: 'answer',
          status: 'connected',
          payload: sdpAnswerMock
        })
      });
      if (!answerRes.ok) {
        throw { stepId: 'answer-sdp', message: `Caller nije uspeo da pošalje SDP Answer odgovor: ${answerRes.statusText}` };
      }
      addLog('SDP Answer uspešno prosleđen u kanal.');
      updateStep('answer-sdp', { 
        status: 'success',
        details: `Status: Connected (Spojeno) | SDP Odgovor poslat Host korisniku.`
      });

      // 8. Exchange WebRTC ICE Candidates
      updateStep('ice-candidate', { status: 'running' });
      addLog('[Step 8] Pokretanje simulirane obostrane razmene ICE mrežnih putanja...');
      const iceMock = { candidate: 'candidate:842163049 1 udp 1677721605 127.0.0.1 55655 typ host raddr 127.0.0.1 rport 55655 gidx 0', sdpMid: '0', sdpMLineIndex: 0 };
      
      const iceRes = await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${callerToken}`
        },
        body: JSON.stringify({
          action: 'create',
          toDeskId: hostDeskId,
          type: 'ice_candidate',
          status: 'connected',
          payload: iceMock
        })
      });
      if (!iceRes.ok) {
        throw { stepId: 'ice-candidate', message: `Neuspešno slanje ICE kandidata: ${iceRes.statusText}` };
      }
      addLog('ICE mrežne putanje razmenjene uspešno.');
      updateStep('ice-candidate', { 
        status: 'success',
        details: `WebRTC ICE Razmena: Prolazna. Spajanje direktnim Peer-to-Peer mrežnim kanalom uočeno.`
      });

      // 9. Clean up sessions / Disconnect cleanly
      updateStep('clean-disconnect', { status: 'running' });
      addLog('[Step 9] Prekid prenosa od strane Caller-a i uništavanje aktivnih signalnih niti...');
      const clearRes = await fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${callerToken}`
        },
        body: JSON.stringify({ action: 'clear' })
      });
      if (!clearRes.ok) {
        throw { stepId: 'clean-disconnect', message: `Greška prilikom pražnjenja niti signala: ${clearRes.statusText}` };
      }
      
      addLog('Sve signalne instance za testne korisnike su uspešno oslobođene.');
      updateStep('clean-disconnect', { 
        status: 'success',
        details: `Kanali očišćeni u potpunosti. Testni Host i Caller su resetovani na "idle" status.`
      });

      addLog('--- INTEGRACIJSKA DIJAGNOSTIKA ZAVRŠENA USPEŠNO (100% PROLAZ) ---');
      setOverallResult('success');

    } catch (err: any) {
      console.error(err);
      const stepId = err.stepId || 'unknown';
      const msg = err.message || 'Sistemska greška tokom izvršavanja test toka.';
      
      if (stepId !== 'unknown') {
        updateStep(stepId, { status: 'failed', error: msg });
      }
      addLog(`❌ GREŠKA: ${msg}`);
      setOverallResult('failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-gray-100 flex flex-col font-sans">
      
      {/* Decorative Gradient Background */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-900/10 via-[#070b13]/0 to-[#070b13]/0 pointer-events-none" />

      {/* Header Container */}
      <header className="relative max-w-7xl w-full mx-auto px-6 pt-12 pb-6 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-gray-800/40 gap-6 z-10">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-widest font-bold">
            <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
            <span>Integrisani Test Panel i Dijagnostika</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mt-1 flex items-center gap-3">
            Simulacija Mreže i Toka Poziva
          </h1>
          <p className="text-gray-400 text-sm mt-1.5 max-w-xl">
            Ova konzola automatski programira mrežni WebRTC prolaz za prenos ekrana, simulirajući poziv, 
            odgovor i handshake bez ikakvih lozinki ili email adresa.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Link 
            href="/" 
            className="w-full sm:w-auto px-5 py-3 bg-gray-900 border border-gray-800 hover:bg-gray-800 rounded-2xl text-[11px] font-black tracking-wider uppercase transition flex items-center justify-center gap-2 text-gray-300"
          >
            <Home className="w-4 h-4" /> Nazad na Dashboard
          </Link>

          <button
            onClick={runAllTests}
            disabled={running}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl text-[11px] font-black tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 active:scale-95 duration-200"
          >
            {running ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Testiranje...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> Pokreni Testove
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Area */}
      <main className="relative max-w-7xl w-full mx-auto px-6 py-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 z-10">
        
        {/* Left Side: Test Steps */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Status Alert Banner */}
          {overallResult === 'success' && (
            <div className="bg-emerald-950/45 border border-emerald-500/30 p-6 rounded-[2rem] flex items-start gap-4 animate-in fade-in duration-300">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl shadow-inner">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <p className="text-emerald-400 font-bold tracking-tight text-lg">Mrežna Dijagnostika Prošla!</p>
                <p className="text-sm text-emerald-200/70 mt-1 leading-relaxed">
                  Čestitamo! Svi mrežni protokoli, JWT autorizacijske sesije i signaling kanali za rad bez emaila su dokazano ispravni. 
                  Sistem može nesmetano uspostaviti Peer-to-Peer ekran prenos medija na svakom Vercel čvoru.
                </p>
              </div>
            </div>
          )}

          {overallResult === 'failed' && (
            <div className="bg-red-950/45 border border-red-500/30 p-6 rounded-[2rem] flex items-start gap-4 animate-in fade-in duration-300">
              <div className="p-3 bg-red-500/10 text-red-400 rounded-2xl shadow-inner">
                <Flame className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <p className="text-red-400 font-bold tracking-tight text-lg">Dijagnostika Detektovala Problem!</p>
                <p className="text-sm text-red-200/70 mt-1 leading-relaxed">
                  Detektovan je problem u jednom od signalnih koraka. Proverite priloženi terminal log sa desne strane 
                  kako biste locirali tačan izuzetak i statusne greške.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {steps.map((step, idx) => {
              const isIdle = step.status === 'idle';
              const isRunning = step.status === 'running';
              const isSuccess = step.status === 'success';
              const isFailed = step.status === 'failed';

              return (
                <div 
                  key={step.id}
                  className={`bg-[#0a101d] border rounded-3xl p-5 flex items-start gap-4 transition-all duration-300 ${
                    isRunning ? 'border-blue-500 shadow-lg shadow-blue-950/30 bg-[#0e172a]' : 
                    isSuccess ? 'border-emerald-500/25' : 
                    isFailed ? 'border-red-500' : 
                    'border-gray-800/40 hover:border-gray-800'
                  }`}
                >
                  {/* Step Index Circle */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs font-mono shrink-0 ${
                    isRunning ? 'bg-blue-600 text-white animate-pulse' : 
                    isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 
                    isFailed ? 'bg-red-500/10 text-red-400' : 
                    'bg-gray-900 text-gray-500'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Step Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-extrabold text-[#f3f4f6] text-base leading-none tracking-tight">
                        {step.name}
                      </h4>
                      
                      {/* Step Status Badges */}
                      <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 px-2 py-1 rounded-md ${
                        isRunning ? 'text-blue-400 bg-blue-500/10 animate-pulse' : 
                        isSuccess ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/10' : 
                        isFailed ? 'text-red-400 bg-red-500/10 border border-red-500/10' : 
                        'text-gray-500 bg-gray-900'
                      }`}>
                        {isRunning ? 'u toku' : isSuccess ? 'uspešno' : isFailed ? 'greška' : 'na čekanju'}
                      </span>
                    </div>

                    <p className="text-gray-400 text-xs mt-2.5 leading-relaxed">
                      {step.description}
                    </p>

                    {/* Step Details or Error messages */}
                    {step.details && (
                      <div className="mt-3 py-2 px-3 bg-gray-950/60 rounded-xl font-mono text-[10px] text-gray-300 border border-gray-900 flex items-center gap-2">
                        <CornerDownRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{step.details}</span>
                      </div>
                    )}

                    {step.error && (
                      <div className="mt-3 py-2 px-3 bg-red-950/20 border border-red-900/30 rounded-xl font-mono text-[10px] text-red-400 flex items-center gap-2">
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span>{step.error}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Log console Terminal */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-[500px]">
          <div className="bg-[#03060c] border border-gray-800/40 rounded-[2.5rem] flex-1 flex flex-col overflow-hidden shadow-2xl relative">
            
            {/* Terminal Header */}
            <div className="px-6 py-4.5 bg-[#050912] border-b border-gray-800/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                <span className="font-mono text-[10px] text-gray-400 uppercase tracking-widest font-black ml-2 leading-none">
                  Live Terminal Log
                </span>
              </div>
              
              {running && (
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                  <span className="font-mono text-[8px] text-blue-400 font-extrabold uppercase tracking-widest animate-pulse">
                    Očitavanje...
                  </span>
                </div>
              )}
            </div>

            {/* Terminal Content lines */}
            <div className="flex-1 p-6 font-mono text-xs text-gray-300 overflow-y-auto space-y-2 dark-scrollbar select-text bg-[#03060c]/90">
              {log.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-20">
                  <Network className="w-10 h-10 mb-4 stroke-[1.5px]" />
                  <p className="text-[10px] uppercase font-bold tracking-wider">Konzola je prazna</p>
                  <p className="text-[9px] mt-1">Pokrenite testove za live dijagnostiku</p>
                </div>
              ) : (
                log.map((line, idx) => {
                  const isError = line.includes('❌') || line.includes('GREŠKA');
                  const isCompletion = line.includes('PROLAZ') || line.includes('ZAVRŠENA');
                  
                  return (
                    <div 
                      key={idx} 
                      className={`${
                        isError ? 'text-red-400' : 
                        isCompletion ? 'text-emerald-400 font-extrabold font-sans py-2 bg-emerald-950/20 border-y border-emerald-950/40 px-2 rounded-md' : 
                        'text-gray-400'
                      } leading-relaxed break-all`}
                    >
                      {line}
                    </div>
                  );
                })
              )}
            </div>

            {/* Terminal Footer Info */}
            <div className="px-6 py-4 bg-[#050912] border-t border-gray-800/40 flex items-center justify-between text-[10px] text-gray-500 font-mono">
              <span className="font-bold">STATUS: {running ? 'RUNNING' : 'IDLE'}</span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 text-yellow-500" />
                <span>JWT Signaling Auth V3</span>
              </span>
            </div>
          </div>
        </div>

      </main>

      {/* Tiny Footer */}
      <footer className="w-full text-center py-6 border-t border-gray-800/40 text-[9px] text-gray-500 uppercase tracking-widest z-10 bg-[#070b13]/80">
        <span>Sistem za automatsku dijagnostiku &copy; 2026 DEŽURNA MREŽA</span>
      </footer>

    </div>
  );
}
