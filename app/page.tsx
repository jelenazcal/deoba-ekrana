'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthState, useAuthDispatch } from '@/app/providers/AuthProvider';
import { useScreenShare } from '@/app/providers/ScreenShareProvider';
import { Icons } from '@/app/components/Icons';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';

// Format desk ID as "XXX XXX XXX" during input
function formatDeskId(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9);
  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  return parts.join(' ');
}

export default function Home() {
  const { user, token, allUsers, loading } = useAuthState();
  const { logout, updateProfileName } = useAuthDispatch();
  const {
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
    disconnectSession,
  } = useScreenShare();

  const [inputDeskId, setInputDeskId] = useState<string>('');
  const [displayNameInput, setDisplayNameInput] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  
  // Modals visibility
  const [showMapModal, setShowMapModal] = useState<boolean>(false);
  const [showMobileSync, setShowMobileSync] = useState<boolean>(false);

  // Success / Error alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mini collaboration tools states
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string; time: string }[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [notepadText, setNotepadText] = useState<string>('');
  const [showCollabDrawer, setShowCollabDrawer] = useState<boolean>(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync displayed Name input when backend user state changes
  useEffect(() => {
    if (user?.fullName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayNameInput(user.fullName);
    }
  }, [user]);

  // Mount clean remote WebRTC streams into HTML5 Video player block
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
      videoRef.current.play().catch(err => console.error('Video autoplay error:', err));
    }
  }, [remoteStream, connectionState]);

  // Handle Hash link connections (e.g. url/#connect=123456789)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const processHashAction = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#connect=')) {
        const valueId = hash.replace('#connect=', '');
        if (valueId.length === 9) {
          const formatted = formatDeskId(valueId);
          setInputDeskId(formatted);
          setSuccessMsg(`Otkriven kod za povezivanje u linku: ${formatted}`);
        }
      }
    };
    processHashAction();
    window.addEventListener('hashchange', processHashAction);
    return () => window.removeEventListener('hashchange', processHashAction);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputDeskId(formatDeskId(e.target.value));
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleaned = inputDeskId.trim();
    if (cleaned.length < 11) {
      showToast('Unesite pun devetocifreni ID partnera (npr. 123 456 789).', 'error');
      return;
    }

    try {
      await startConnection(cleaned);
      showToast('Poziv je upućen... Molimo sačekajte potvrdu partnera na udaljenom računaru.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Neuspešno povezivanje.', 'error');
    }
  };

  const handleUpdateNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayNameInput.trim()) return;
    try {
      await updateProfileName(displayNameInput.trim());
      setIsEditingName(false);
      showToast('Naziv računara je uspešno promenjen na mreži!', 'success');
    } catch (err: any) {
      showToast('Greška tokom promene naziva.', 'error');
    }
  };

  const copyToClipboard = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.connectionId);
    showToast('Vaš ID broj je kopiran u privremenu memoriju!', 'success');
  };

  const copyShareLink = () => {
    if (!user) return;
    const cleanId = user.connectionId.replace(/\s+/g, '');
    const shareUrl = `${window.location.origin}/#connect=${cleanId}`;
    navigator.clipboard.writeText(shareUrl);
    showToast('Brzi link za saradnju je kopiran!', 'success');
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user) return;
    const date = new Date();
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    setChatMessages(prev => [...prev, { sender: user.fullName, text: chatInput.trim(), time: timeStr }]);
    setChatInput('');
  };

  const quickConnect = (deskId: string) => {
    setInputDeskId(deskId);
    setErrorMsg(null);
    startConnection(deskId).catch((err: any) => showToast(err.message || 'Greška u povezivanju.', 'error'));
  };

  const captureFrame = () => {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `ekran_snimak_${Date.now()}.png`;
        link.click();
        showToast('Snimak ekrana je uspesno sacuvan na vas racunar!', 'success');
      }
    } catch (e) {
      showToast('Nije moguće napraviti snimak sa ovog ekrana.', 'error');
    }
  };

  // Loader state during initialization
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#FBFBFF] flex items-center justify-center flex-col space-y-4">
        <Icons.RefreshCw className="w-12 h-12 text-green-600 animate-spin" />
        <p className="text-sm font-black text-gray-500 uppercase tracking-widest leading-none">Učitavanje ZC mreže...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-white">
      
      {/* GLOBAL TOAST ALERTERS */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed top-6 right-6 z-[120] bg-green-950/95 border border-green-500/30 text-green-300 px-6 py-4 rounded-2xl shadow-xl backdrop-blur flex items-center gap-3 animate-in duration-300"
          >
            <Icons.Check className="w-5 h-5 text-green-400 shrink-0" />
            <p className="text-xs font-black uppercase tracking-wider">{successMsg}</p>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed top-6 right-6 z-[120] bg-red-950/95 border border-red-500/30 text-red-300 px-6 py-4 rounded-2xl shadow-xl backdrop-blur flex items-center gap-3 animate-in duration-300"
          >
            <Icons.AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-xs font-black uppercase tracking-wider">{errorMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WEBRTC INCOMING REQUEST APPROVAL DIALOG MODAL ON THE HOST SIDE */}
      <AnimatePresence>
        {incomingRequest && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] bg-gray-950/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white max-w-lg w-full rounded-[2.5rem] p-10 border border-gray-100 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-2 bg-green-500"></div>
              
              <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-6 text-green-600 border border-green-100">
                <Icons.Monitor className="w-8 h-8 animate-pulse" />
              </div>

              <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-7 md:leading-8 mb-2">
                Novi zahtev za prenos
              </h3>

              <div className="bg-gray-50 p-6 rounded-3xl mb-8">
                <p className="text-sm font-medium text-gray-500 mb-1">Traži pristup:</p>
                <p className="text-xl font-black text-gray-900 tracking-tight">{incomingRequest.fromName}</p>
                <p className="text-xs text-gray-400 mt-1 font-mono">ID broj: {incomingRequest.fromDeskId}</p>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed mb-8">
                Kolega sa računara **{incomingRequest.fromName}** moli dozvolu da gleda Vaš dežurni ekran radi pomoći ili brze saradnje u realnom vremenu. Pristup je jednosmeran i možete ga ugasiti u bilo kom sekundi!
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={acceptIncomingRequest}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-wider transition-all transform active:scale-95 shadow-lg shadow-green-200"
                >
                  Dozvoli i emituj
                </button>
                <button 
                  onClick={rejectIncomingRequest}
                  className="flex-1 bg-white hover:bg-gray-50 text-red-600 border border-gray-200 font-black py-4 rounded-2xl text-xs uppercase tracking-wider transition-all"
                >
                  Odbij poziv
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PHONE SYNCHRONIZER QR OVERLAY */}
      <AnimatePresence>
        {showMobileSync && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-gray-950/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl text-center border relative"
            >
              <div className="w-16 h-16 bg-green-50 text-green-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-green-100">
                <Icons.Monitor className="w-8 h-8" />
              </div>

              <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Sinhronizuj prenos</h2>
              <p className="text-gray-500 text-xs leading-relaxed mb-6">
                Skenirajte priloženi QR-kod na svom pametnom telefonu da biste brzo otvorili i pratili ovaj ekran na mobilnom uređaju bez instalacije.
              </p>

              <div className="bg-gray-50 p-6 rounded-2xl mb-8 border border-gray-100 flex items-center justify-center">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(`${window.location.origin}/#connect=${user.connectionId.replace(/\s+/g, '')}`)}`} 
                  alt="Sync QR" 
                  className="w-44 h-44 rounded-xl bg-white p-2 shadow-sm border border-gray-100" 
                />
              </div>

              <button 
                onClick={() => setShowMobileSync(false)}
                className="w-full py-4 bg-gray-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-800 transition"
              >
                Zatvori panel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAP MODAL (MAPA AMBULANTI) */}
      <AnimatePresence>
        {showMapModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] bg-gray-950/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl text-center border relative"
            >
              <h3 className="text-2xl font-black text-gray-950 tracking-tight mb-4">Lokacije i ordinacije</h3>
              
              <div className="mb-6 rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex items-center justify-center bg-gray-50 p-12">
                <div className="text-center py-6">
                  <Icons.Shield className="w-14 h-14 text-green-600 mx-auto mb-4" />
                  <p className="font-mono font-bold text-gray-800 text-sm">Interna mreža ordinacija i kabineta</p>
                  <p className="text-xs text-gray-400 mt-2">Integrisani sistem za prenos ekrana i saradnju</p>
                  <p className="text-xs text-green-600 font-mono tracking-wider uppercase mt-4">[ GLAVNA INTERNA LOKACIJA ]</p>
                </div>
              </div>

              <button 
                onClick={() => setShowMapModal(false)} 
                className="px-8 py-3 bg-gray-900 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:bg-gray-800 transition"
              >
                Zatvori Mapu
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE HEADER FOR HANDHELD SCREENS */}
      <div className="md:hidden bg-gray-950 border-b border-white/5 px-4 py-3.5 flex items-center justify-between shrink-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-green-600 rounded-lg text-white">
            <Icons.Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-white text-xs tracking-tight block">Dežurna Mreža</span>
            <span className="text-[7.5px] text-[#5ce08c] font-black tracking-widest uppercase block">prenos i brzi pristup</span>
          </div>
        </div>
        <button 
          onClick={() => setMobileSidebarOpen(true)}
          className="p-2 hover:bg-white/10 text-white rounded-lg transition"
          title="Otvori navigaciju"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* MOBILE SIDEBAR MODAL/DRAWER (SLIDE OVER) */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-[250] md:hidden">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm"
            />
            
            {/* Sliding Drawer */}
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 bottom-0 left-0 w-72 bg-gray-950 text-white flex flex-col justify-between border-r border-white/5 h-full z-10 shadow-2xl"
            >
              <div className="p-6 flex flex-col space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-600 rounded-xl text-white">
                      <Icons.Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-black text-sm tracking-tight block">Dežurna Mreža</span>
                      <span className="text-[8px] text-[#5ce08c] font-black tracking-widest uppercase block mt-0.5">saradnja i prenos</span>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setMobileSidebarOpen(false)}
                    className="p-1.5 hover:bg-white/15 rounded text-gray-400 animate-in spin-in duration-300"
                    title="Zatvori navigaciju"
                  >
                    <Icons.X className="w-5 h-5" />
                  </button>
                </div>

                <div className="py-2.5 px-4 bg-white/5 border border-white/5 rounded-xl text-center">
                  <div className="flex items-center gap-2 justify-center text-[9px] text-green-400 font-mono tracking-widest font-black uppercase">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span>Slobodno korišćenje</span>
                  </div>
                </div>
              </div>

              {/* Status Section inside mobile drawer */}
              <div className="p-6 bg-white/5 m-5 rounded-[2rem] border border-white/5 text-xs text-left">
                <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider mb-2">Moja dežurna lokacija:</p>
                
                <div className="space-y-4">
                  {isEditingName ? (
                    <form onSubmit={handleUpdateNameSubmit} className="space-y-2">
                      <input 
                        type="text"
                        value={displayNameInput}
                        onChange={(e) => setDisplayNameInput(e.target.value)}
                        className="w-full bg-gray-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-green-500 font-bold"
                        maxLength={25}
                        placeholder="Ime / Naziv..."
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <button 
                          type="submit" 
                          className="flex-1 bg-green-600 text-white text-[10px] py-1 font-black rounded hover:bg-green-500"
                        >
                          Sačuvaj
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            setDisplayNameInput(user.fullName);
                            setIsEditingName(false);
                          }} 
                          className="px-2 bg-white/10 text-white text-[10px] rounded"
                        >
                          Otkaži
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="overflow-hidden">
                        <p className="font-extrabold text-white text-sm truncate">{user.fullName}</p>
                        <p className="text-[8px] text-[#5ce08c] font-black tracking-widest uppercase">{user.title}</p>
                      </div>
                      <button 
                        onClick={() => setIsEditingName(true)}
                        className="p-1.5 hover:bg-white/15 rounded text-gray-400"
                        title="Promeni naziv računara"
                      >
                        <Icons.Settings className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="border-t border-white/5 pt-3.5 space-y-2">
                    <button 
                      onClick={() => {
                        setShowMobileSync(true);
                        setMobileSidebarOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-950/40 hover:bg-green-600 rounded-xl text-[9px] font-black tracking-widest transition border border-green-900/20 text-green-400 hover:text-white uppercase"
                    >
                      <Icons.Monitor className="w-3 h-3" />
                      <span>Poveži telefon</span>
                    </button>

                    <button 
                      onClick={() => {
                        logout();
                        setMobileSidebarOpen(false);
                      }} 
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-950/10 hover:bg-red-950/60 rounded-xl text-[9px] font-black tracking-widest transition border border-red-900/10 text-red-400 hover:text-white uppercase"
                      title="Generiši nov ID ustanove"
                    >
                      <Icons.Logout className="w-3 h-3" />
                      <span>Novi ID (Odjava)</span>
                    </button>

                    <Link 
                      href="/tests" 
                      onClick={() => setMobileSidebarOpen(false)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-950/20 hover:bg-blue-600 rounded-xl text-[9px] font-black tracking-widest transition border border-blue-900/20 text-blue-400 hover:text-white uppercase"
                      title="Pokreni simulaciju i testove toka poziva"
                    >
                      <Icons.Settings className="w-3 h-3 text-blue-400" />
                      <span>Mrežna Dijagnostika</span>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SIDEBAR NAVIGATION AREA (SIMPLIFIED & HIGH CONTRAST) */}
      <aside className="hidden md:flex w-64 bg-gray-950 text-white flex-col shrink-0 border-r border-white/5 h-full justify-between">
        <div className="p-8 flex flex-col space-y-8">
          {/* Logo badge area */}
          <div className="flex items-center gap-4">
            <div className="p-2 bg-green-600 rounded-xl shadow-lg shadow-green-900/40 text-white leading-none">
              <Icons.Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-lg tracking-tight leading-none block">Dežurna Mreža</span>
              <span className="text-[9px] text-[#5ce08c] font-black tracking-widest uppercase block mt-1">prenos i brzi pristup</span>
            </div>
          </div>

          <div className="py-2.5 px-4 bg-white/5 border border-white/5 rounded-xl text-center">
            <div className="flex items-center gap-2 justify-center text-[10px] text-green-400 font-mono tracking-widest font-black uppercase">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Slobodno korišćenje</span>
            </div>
          </div>
        </div>

        {/* Minimal status section */}
        <div className="p-6 bg-white/5 m-5 rounded-[2rem] border border-white/5 text-xs text-left">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider mb-2">Moja dežurna lokacija:</p>
          
          <div className="space-y-4">
            {isEditingName ? (
              <form onSubmit={handleUpdateNameSubmit} className="space-y-2">
                <input 
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-green-500 font-bold"
                  maxLength={25}
                  placeholder="Ime / Naziv..."
                  autoFocus
                />
                <div className="flex gap-1">
                  <button 
                    type="submit" 
                    className="flex-1 bg-green-600 text-white text-[10px] py-1 font-black rounded hover:bg-green-500"
                  >
                    Sačuvaj
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setDisplayNameInput(user.fullName);
                      setIsEditingName(false);
                    }} 
                    className="px-2 bg-white/10 text-white text-[10px] rounded"
                  >
                    Otkaži
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="overflow-hidden">
                  <p className="font-extrabold text-white text-sm truncate">{user.fullName}</p>
                  <p className="text-[8px] text-[#5ce08c] font-black tracking-widest uppercase">{user.title}</p>
                </div>
                <button 
                  onClick={() => setIsEditingName(true)}
                  className="p-1.5 hover:bg-white/15 rounded text-gray-400"
                  title="Promeni naziv računara"
                >
                  <Icons.Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="border-t border-white/5 pt-3.5 space-y-2">
              <button 
                onClick={() => setShowMobileSync(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-950/40 hover:bg-green-600 rounded-xl text-[9px] font-black tracking-widest transition border border-green-900/20 text-green-400 hover:text-white uppercase"
              >
                <Icons.Monitor className="w-3 h-3" />
                <span>Poveži telefon</span>
              </button>

              <button 
                onClick={logout} 
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-950/10 hover:bg-red-950/60 rounded-xl text-[9px] font-black tracking-widest transition border border-red-900/10 text-red-400 hover:text-white uppercase"
                title="Generiši nov ID ustanove"
              >
                <Icons.Logout className="w-3 h-3" />
                <span>Novi ID (Odjava)</span>
              </button>

              <Link 
                href="/tests" 
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-950/20 hover:bg-blue-600 rounded-xl text-[9px] font-black tracking-widest transition border border-blue-900/20 text-blue-400 hover:text-white uppercase"
                title="Pokreni simulaciju i testove toka poziva"
              >
                <Icons.Settings className="w-3 h-3 text-blue-400" />
                <span>Mrežna Dijagnostika</span>
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT WORKSPACE AREA */}
      <main className="flex-1 flex flex-col bg-[#FBFBFF] overflow-hidden justify-between h-full relative">
        
        {/* HEADER TOOLBAR BAR */}
        <header className="bg-white px-4 md:px-10 py-5 md:py-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-3 sm:gap-0">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight leading-tight">
              Udaljeni prenos i saradnja u hodniku
            </h1>
            <p className="text-[10px] md:text-xs text-gray-400 mt-1 md:mt-1.5 font-medium leading-none">
              Sistem za prenos ekrana bez instalacije i bez ikakvih lozinki za 50 internih kolega.
            </p>
          </div>

          <button 
            onClick={() => setShowMapModal(true)}
            className="w-full sm:w-auto px-5 py-3 border border-gray-200 hover:bg-gray-50 rounded-xl text-[10px] font-black tracking-wider uppercase transition shadow-sm"
          >
            Pregled ordinacija
          </button>
        </header>

        {/* WORKSPACE AREA CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 md:p-10">
          
          {/* SIDER VIEW AND SCREEN PLAYER PANELS */}
          <div className="w-full space-y-8">
            
            {/* STREAMING SCREEN (CONNECTED VIEWPORT PLAYER) */}
            {connectionState === 'connected' && (
              <div id="connection_view_stage" className="bg-gray-950 rounded-[2.5rem] overflow-hidden border border-white/5 flex flex-col h-[70vh] shadow-2xl animate-in fade-in duration-300">
                
                {/* Header Stream Bar */}
                <div className="px-8 py-5 bg-gray-900/60 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <div>
                      <p className="text-[10px] font-black tracking-widest text-[#5ce08c] uppercase">Povezan i aktivan prenos</p>
                      <h4 className="text-sm font-black text-white tracking-tight">{partnerName} • Desk ID: {partnerDeskId}</h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowCollabDrawer(prev => !prev)}
                      className={`p-2.5 rounded-xl border border-white/5 font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 ${showCollabDrawer ? 'bg-[#5ce08c] text-gray-950' : 'bg-white/5 hover:bg-white/10 text-white'}`}
                    >
                      <Icons.Layers className="w-3.5 h-3.5" />
                      <span>Beležnica & Ćaskanje</span>
                    </button>

                    {!isSharingOwnScreen && (
                      <button 
                        onClick={captureFrame}
                        className="bg-white/5 hover:bg-white/10 text-white p-2.5 rounded-xl border border-white/5 transition-all"
                        title="Napravi snimak ekrana u fajl"
                      >
                        <Icons.Camera className="w-4 h-4" />
                      </button>
                    )}

                    <button 
                      onClick={disconnectSession}
                      className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-black tracking-wider uppercase transition-all"
                    >
                      Zatvori vezu
                    </button>
                  </div>
                </div>

                {/* Video container and text notes split panel */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                  
                  <div className="flex-1 min-h-[300px] bg-black flex items-center justify-center relative overflow-hidden">
                    {isSharingOwnScreen ? (
                      <div className="text-center p-12 text-white max-w-sm">
                        <div className="w-16 h-16 bg-[#5ce08c]/10 text-[#5ce08c] rounded-2xl flex items-center justify-center mx-auto mb-5 border border-[#5ce08c]/20">
                          <Icons.MonitorUp className="w-8 h-8 animate-bounce" />
                        </div>
                        <h4 className="text-lg font-black mb-2">Vaš ekran se deli</h4>
                        <p className="text-xs text-gray-400">
                          Kolega sa računara **{partnerName}** trenutno pregleda vaš rad u realnom vremenu.
                        </p>
                        <button 
                          onClick={disconnectSession}
                          className="mt-6 px-5 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all"
                        >
                          Zaustavi deljenje
                        </button>
                      </div>
                    ) : (
                      <>
                        <video 
                          ref={videoRef}
                          className="w-full h-full object-contain"
                          playsInline
                          autoPlay
                        />
                        <div className="absolute bottom-6 left-6 bg-gray-900/90 border border-white/10 px-4 py-2.5 rounded-xl flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-[9px] font-black text-white uppercase tracking-wider font-mono">WebRTC Direktan link: Odličan prenos</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sidle Collab drawer panel for notes and chat */}
                  {showCollabDrawer && (
                    <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/5 bg-gray-900 flex flex-col h-72 lg:h-full shrink-0">
                      
                      {/* Notepad */}
                      <div className="p-4 border-b border-white/5 flex flex-col h-1/2">
                        <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider mb-2 block">Brzi zapisnik lekarske ekipe:</span>
                        <textarea 
                          value={notepadText}
                          onChange={(e) => setNotepadText(e.target.value)}
                          placeholder="Zajednički ordinirajući nalazi, uputstva ili priručne beleške klinike..."
                          className="flex-1 bg-gray-950/40 border border-white/5 rounded-xl p-3 text-xs font-semibold text-white placeholder-gray-500 outline-none focus:border-green-500/50 transition-all resize-none font-mono"
                        />
                      </div>

                      {/* Chat messages */}
                      <div className="flex-1 flex flex-col h-1/2 justify-between overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Poruke ćaskanja:</span>
                          
                          {chatMessages.length === 0 && (
                            <div className="py-6 text-center text-[9px] uppercase font-black text-gray-500 tracking-widest">
                              Nema poruka u sesiji.
                            </div>
                          )}

                          {chatMessages.map((msg, i) => (
                            <div key={i} className="bg-gray-950/40 p-3 rounded-xl border border-white/5">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-black text-green-300">{msg.sender}</span>
                                <span className="text-[8px] text-gray-500 font-mono">{msg.time}</span>
                              </div>
                              <p className="text-xs text-white leading-relaxed">{msg.text}</p>
                            </div>
                          ))}
                        </div>

                        <form onSubmit={sendChat} className="p-3 border-t border-white/5 bg-gray-950/20 flex gap-2">
                          <input 
                            type="text" 
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Započni dopisivanje..."
                            className="flex-1 bg-gray-950/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-green-500/50"
                          />
                          <button 
                            type="submit"
                            className="bg-[#5ce08c] hover:bg-[#49cc79] text-gray-950 px-3.5 rounded-lg font-black text-xs transition"
                          >
                            Slajd
                          </button>
                        </form>
                      </div>

                    </div>
                  )}

                </div>
              </div>
            )}

            {/* DEFAULT STATE: IDLE INTERFACE FOR CONTROLS */}
            {connectionState !== 'connected' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Panel 1: Display Your Own Desk ID code */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden min-h-[300px]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full -mr-16 -mt-16 blur-xl"></div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-50 text-green-600 rounded-xl border border-green-100">
                        <Icons.Monitor className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Ovaj Računar</h3>
                        <p className="text-xs text-gray-400 font-medium">Direktan prenos bez softvera i lozinke</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-100 p-8 rounded-[2rem] flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        ADRESA VAŠEG RADIOLOGIJSKOG CENTRA
                      </span>
                      <p className="text-3xl md:text-4xl font-mono font-black text-green-600 tracking-[0.1em] leading-none mb-1">
                        {user.connectionId}
                      </p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">interna bezbedna ZC-mreža</p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100 flex gap-3">
                    <button 
                      onClick={copyToClipboard}
                      className="flex-1 flex items-center justify-center gap-2 py-4 bg-gray-900 hover:bg-gray-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-sm"
                    >
                      <Icons.Copy className="w-4 h-4" />
                      <span>Kopiraj ID</span>
                    </button>
                    <button 
                      onClick={copyShareLink}
                      className="flex-1 flex items-center justify-center gap-2 py-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-black text-xs uppercase tracking-wider rounded-xl transition"
                    >
                      <Icons.Link className="w-4 h-4" />
                      <span>Kopiraj Link</span>
                    </button>
                  </div>
                </div>

                {/* Panel 2: Connect to Partner's Computer */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden min-h-[300px]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 blur-xl"></div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                        <Icons.Settings className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Poveži se sa partnerom</h3>
                        <p className="text-xs text-gray-400 font-medium">Unesite ID da biste videli dežurni monitor ekrana</p>
                      </div>
                    </div>

                    {/* Calling loading phase */}
                    {connectionState === 'calling' ? (
                      <div className="bg-indigo-50/50 border border-indigo-100 p-8 rounded-[2rem] flex flex-col items-center justify-center text-center py-10 animate-pulse">
                        <div className="mb-4 relative">
                          <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-25"></div>
                          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center relative">
                            <Icons.Monitor className="w-5 h-5" />
                          </div>
                        </div>
                        <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest mb-1">Čekanje na pristanak...</h4>
                        <p className="text-[11px] text-indigo-500 max-w-xs leading-relaxed">
                          Partner sa Desk ID adrese <span className="font-bold underline">{partnerDeskId}</span> je dobio poziv. Čeka se akcija dozvole na njegovoj tastaturi.
                        </p>
                        <button 
                          onClick={disconnectSession}
                          className="mt-6 px-4 py-2 bg-red-650 hover:bg-red-700 bg-red-600 text-white text-[9px] font-bold rounded-lg uppercase tracking-widest transition"
                        >
                          PREKINI POZIV
                        </button>
                      </div>
                    ) : connectionState === 'rejected' ? (
                      <div className="bg-red-50 border border-red-100 p-8 rounded-[2rem] flex flex-col items-center justify-center text-center py-10">
                        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                          <Icons.AlertTriangle className="w-5 h-5" />
                        </div>
                        <h4 className="text-xs font-black text-red-900 uppercase tracking-widest mb-1">Veza je odbijena</h4>
                        <p className="text-[11px] text-red-500 max-w-xs leading-relaxed">
                          Udaljeni računar u kabinetu je u ovom trenutku odbio ili blokirao pristup ekranu.
                        </p>
                        <button 
                          onClick={disconnectSession}
                          className="mt-6 px-4 py-2 bg-gray-900 text-white text-[9px] font-bold rounded-lg uppercase tracking-widest transition"
                        >
                          POKUŠAJ PONOVO
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleConnect} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Udaljeni ID broj:</label>
                          <input 
                            type="text"
                            value={inputDeskId}
                            onChange={handleInputChange}
                            placeholder="Zapišite ID npr. 129 382 103"
                            className="w-full bg-gray-50 border border-gray-100 px-6 py-4 rounded-xl outline-none focus:ring-4 focus:ring-green-100 font-mono font-black text-center text-xl tracking-[0.1em] text-gray-800 placeholder-gray-300"
                            maxLength={11}
                          />
                        </div>
                        <button 
                          type="submit"
                          className="w-full flex items-center justify-center gap-2.5 py-4.5 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-green-200"
                        >
                          <Icons.Video className="w-4.5 h-4.5" />
                          <span>Započni prenos partnera</span>
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="pt-4 border-t border-gray-50 flex items-center gap-2 opacity-40">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">veze su enkriptovane i bezbedne</p>
                  </div>
                </div>

              </div>
            )}

            {/* PEERS DIRECTORY LIST (ONE-CLICK TO CONNECT QUICK ACTION CENTER) */}
            {connectionState !== 'connected' && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-black text-gray-900 tracking-tight">
                      Aktivni dežurni računari u ambulantama
                    </h3>
                    <p className="text-xs text-gray-400 font-medium leading-normal mt-1">
                      Korisnici ne moraju da se registruju. Svi računari u Vašoj internoj mreži koji imaju otvoren ovaj link se pojavljuju dinamički. Kliknite na ikonu da započnete predeo ili gledate ekran!
                    </p>
                  </div>
                  <div className="px-4 py-1.5 bg-green-50 border border-green-100 text-green-600 rounded-full text-[9px] font-black tracking-widest uppercase">
                    AKTIVNI RAČUNARI: {allUsers.filter(u => u.connectionId !== user?.connectionId).length}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allUsers.filter(u => u.connectionId !== user?.connectionId).map(peer => (
                    <div 
                      key={peer.id} 
                      className="p-5 rounded-xl border border-green-50 bg-green-50/5 hover:border-green-300 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-600 border border-gray-100 flex items-center justify-center font-black text-xs uppercase">
                            {peer.fullName.charAt(0)}
                          </div>
                          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 border-white rounded-full bg-green-500" />
                        </div>
                        <div className="overflow-hidden text-left">
                          <p className="font-extrabold text-sm text-gray-900 truncate tracking-tight">{peer.fullName}</p>
                          <p className="text-[10px] text-gray-400 truncate tracking-tight font-medium uppercase font-mono">{peer.connectionId}</p>
                        </div>
                      </div>

                      <button 
                        onClick={() => quickConnect(peer.connectionId)}
                        className="p-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition transform active:scale-90 flex items-center justify-center"
                        title="Poveži se jednim klikom"
                      >
                        <Icons.Video className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  ))}

                  {allUsers.filter(u => u.connectionId !== user?.connectionId).length === 0 && (
                    <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-gray-300">
                      <Icons.User className="w-10 h-10 mb-3 text-gray-200" />
                      <p className="text-xs uppercase font-black tracking-widest text-gray-400">Trenutno nema drugih aktivnih računara</p>
                      <p className="text-[10px] text-gray-400 mt-1 max-w-xs">
                        Otvorite ovaj link na još nekom računaru ili u drugom prozoru pregledača da biste ga videli ovde!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>

        {/* FOOTER CALL TO ACTIONS */}
        <footer className="bg-white border-t border-gray-100 px-4 md:px-10 py-4 md:py-5 flex flex-col md:flex-row items-center justify-between shrink-0 text-center md:text-left gap-3">
          <div className="flex flex-wrap items-center gap-5 justify-center md:justify-start">
            <button 
              onClick={() => setShowMobileSync(true)}
              className="text-[9px] font-black text-green-600 hover:text-green-800 uppercase tracking-widest flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span>Poveži dežurni telefon preko QR CODA</span>
            </button>

            <Link 
              href="/tests"
              className="text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span>Pokreni Test Toka Poziva / Dijagnostiku</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-4 text-[9px] font-black uppercase text-gray-300 tracking-widest">
            <span>SISTEM ZA PRENOS v3.5.0-GUEST</span>
            <span className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
            <span>© 2026 PORTAL BEZ INSTALACIJE</span>
          </div>
        </footer>

      </main>

    </div>
  );
}
