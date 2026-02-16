'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── Types ───────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sender?: string;
  proposalId?: string;
  targetRole?: string;
}

interface VoteOption {
  id: string;
  label: string;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  options: VoteOption[];
  votes: Record<string, string>;
  createdBy: string;
  createdAt: number;
  durationHours: number;
  endsAt: number;
  status: 'active' | 'closed';
  closedAt?: number;
  aiResponseMessageId?: string;
}

interface RoomSummary {
  roomId: string;
  title: string;
  role: 'admin' | 'member';
  roomStatus: 'active' | 'archived' | 'deleted';
  joinedAt: string;
  lastSeenAt: string;
  lastMessageAt: string | null;
}

interface RoomFact {
  id: string;
  shortId: string | null;
  fact: string;
  source: string | null;
  createdBy: string | null;
  createdAt: string;
}

const defaultProposalOptions = ['Yes', 'No', 'Abstain'];

// ─── Icon Helper ─────────────────────────────────────────────────────
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-icons-round ${className}`}>{name}</span>;
}

// ─── Main Component ──────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [lastError, setLastError] = useState<string>('');
  const [targetRole, setTargetRole] = useState<string>('Narrator');

  // Room & User
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [roomId, setRoomId] = useState<string>('');
  const [joined, setJoined] = useState(false);
  const [username, setUsername] = useState('');
  const [roomTitle, setRoomTitle] = useState('Valle Verde Simulation');
  const [roomRole, setRoomRole] = useState<'admin' | 'member'>('member');
  const [chatMode, setChatMode] = useState<'ai' | 'room'>('ai');

  // Join form inputs
  const [joinRoomIdInput, setJoinRoomIdInput] = useState('');
  const [joinUsernameInput, setJoinUsernameInput] = useState('');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Proposal/Voting States
  const [activeProposals, setActiveProposals] = useState<Proposal[]>([]);
  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [newProposalTitle, setNewProposalTitle] = useState('');
  const [newProposalDescription, setNewProposalDescription] = useState('');
  const [newProposalOptions, setNewProposalOptions] = useState<string[]>([...defaultProposalOptions]);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [closingProposal, setClosingProposal] = useState<string | null>(null);
  const [voteDuration, setVoteDuration] = useState(24);
  const [participants, setParticipants] = useState<string[]>([]);

  // UI state
  const [showAddressingDropdown, setShowAddressingDropdown] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [renamingRoom, setRenamingRoom] = useState(false);
  const [myRooms, setMyRooms] = useState<RoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomFacts, setRoomFacts] = useState<RoomFact[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTypingSentRef = useRef<number>(0);

  const handleSessionExpired = useCallback(() => {
    setJoined(false);
    setRoomId('');
    setMessages([]);
    setActiveProposals([]);
    setRoomFacts([]);
    setTypingUsers({});
    setParticipants([]);
    setMyRooms([]);
    setRoomTitle('Valle Verde Simulation');
    setRoomRole('member');
    setChatMode('ai');
    setJoinPasswordInput('');
    setIsLoggedIn(false);
    setAuthError('Session expired. Please sign in again.');
  }, []);

  // ─── Personas list ─────────────────────────────────────────────────
  const personas = [
    { label: 'Narrator', icon: 'auto_stories', color: 'bg-sage-600' },
    { label: 'Farmers', icon: 'agriculture', color: 'bg-amber-600' },
    { label: 'Universities', icon: 'school', color: 'bg-blue-600' },
    { label: 'NGO', icon: 'volunteer_activism', color: 'bg-rose-500' },
    { label: 'Business', icon: 'business', color: 'bg-sage-800' },
    { label: 'Municipality', icon: 'account_balance', color: 'bg-teal-600' },
    { label: 'EU Regulator', icon: 'gavel', color: 'bg-slate-700' },
  ];

  const currentPersona = personas.find(p => p.label === targetRole) || personas[0];

  // Helper: border accent color per persona (inline style for assistant messages)
  const personaBorderColors: Record<string, string> = {
    'Narrator': '#588168',
    'Farmers': '#d97706',
    'Universities': '#2563eb',
    'NGO': '#f43f5e',
    'Business': '#3a5444',
    'Municipality': '#0d9488',
    'EU Regulator': '#334155',
  };

  // Helper: determine which character is responding for an assistant message
  const getRespondingCharacter = (msgIndex: number) => {
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].targetRole) {
        const persona = personas.find(p => p.label === messages[i].targetRole);
        return {
          role: messages[i].targetRole!,
          persona: persona || personas[0],
          askedBy: messages[i].sender || 'Someone',
        };
      }
    }
    return {
      role: 'Narrator',
      persona: personas[0],
      askedBy: 'Someone',
    };
  };

  const proposalOptionPresets = [
    { icon: 'check_circle', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800' },
    { icon: 'cancel', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800' },
    { icon: 'remove_circle_outline', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' }
  ];

  const formatTimeRemaining = (proposal: Proposal) => {
    const hasDuration = Number.isFinite(proposal.durationHours);
    const endsAt = proposal.endsAt ?? (hasDuration ? proposal.createdAt + proposal.durationHours * 60 * 60 * 1000 : null);
    if (!endsAt) return null;
    const diffMs = endsAt - Date.now();
    if (diffMs <= 0) return 'Closed';
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `Ends in ${days}d ${remHours}h`;
    }
    if (hours > 0) return `Ends in ${hours}h ${minutes}m`;
    return `Ends in ${minutes}m`;
  };

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const res = await fetch('/api/auth', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) {
            setIsLoggedIn(false);
          }
          return;
        }

        const data = await res.json();
        const user = data?.user;
        const identity =
          (typeof user?.email === 'string' && user.email.trim()) ||
          (typeof user?.username === 'string' && user.username.trim()) ||
          (typeof user?.displayName === 'string' && user.displayName.trim()) ||
          '';

        if (!cancelled && identity) {
          setUsername(identity);
          setJoinUsernameInput(typeof user?.email === 'string' ? user.email : identity);
          setIsLoggedIn(true);
          setAuthError('');
        }
      } catch {
        if (!cancelled) {
          setIsLoggedIn(false);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000 && roomId && username) {
      lastTypingSentRef.current = now;
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'typing', roomId, sender: username }),
      }).catch(console.error);
    }
  };

  const sendPresence = useCallback((overrideRoomId?: string, overrideUsername?: string) => {
    const resolvedRoomId = overrideRoomId || roomId;
    const resolvedUsername = overrideUsername || username;
    if (!resolvedRoomId || !resolvedUsername) return;
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'presence', roomId: resolvedRoomId, sender: resolvedUsername }),
    })
      .then((res) => {
        if (res.status === 401) {
          handleSessionExpired();
        }
      })
      .catch(console.error);
  }, [roomId, username, handleSessionExpired]);

  const leaveRoom = useCallback((overrideRoomId?: string) => {
    const resolvedRoomId = overrideRoomId || roomId;
    if (!resolvedRoomId) return;
    const payload = JSON.stringify({ action: 'leave', roomId: resolvedRoomId });

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/chat', blob);
        return;
      }
    } catch {
      // fall through to fetch
    }

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [roomId]);

  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/chat?roomId=${encodeURIComponent(roomId)}`);
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const serverMessages = data.messages || [];
        setAiThinking(data.aiThinking || false);
        setParticipants(Array.isArray(data.participants) ? data.participants : []);
        if (typeof data.roomTitle === 'string' && data.roomTitle.trim()) {
          setRoomTitle(data.roomTitle);
        }
        if (data.roomRole === 'admin' || data.roomRole === 'member') {
          setRoomRole(data.roomRole);
        }
        const now = Date.now();
        const activeTypers: Record<string, number> = {};
        const rawTypers = data.typingUsers || {};
        Object.entries(rawTypers).forEach(([user, time]) => {
          if (user !== username && now - (time as number) < 3000) {
            activeTypers[user] = time as number;
          }
        });
        setTypingUsers(activeTypers);
        setActiveProposals(data.proposals || []);
        setMessages((prev) => {
          if (prev.length !== serverMessages.length) return serverMessages;
          if (JSON.stringify(prev) !== JSON.stringify(serverMessages)) return serverMessages;
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to fetch messages', error);
    }
  }, [roomId, username, handleSessionExpired]);

  const fetchMyRooms = useCallback(async () => {
    if (!isLoggedIn) return;
    setRoomsLoading(true);
    try {
      const res = await fetch('/api/rooms?limit=30', { cache: 'no-store' });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.rooms)) {
        setMyRooms(data.rooms as RoomSummary[]);
      }
    } finally {
      setRoomsLoading(false);
    }
  }, [isLoggedIn, handleSessionExpired]);

  const fetchRoomFacts = useCallback(async (opts?: { silent?: boolean }) => {
    if (!roomId) return;
    const silent = opts?.silent ?? false;
    if (!silent) {
      setFactsLoading(true);
    }

    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/facts?limit=50`, {
        cache: 'no-store'
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.facts)) {
        setRoomFacts(data.facts as RoomFact[]);
      }
    } finally {
      if (!silent) {
        setFactsLoading(false);
      }
    }
  }, [roomId, handleSessionExpired]);



  useEffect(() => {
    if (!joined || !roomId) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 1000);
    return () => clearInterval(interval);
  }, [joined, roomId, fetchMessages]);

  useEffect(() => {
    if (!joined || !roomId || !username) return;
    sendPresence();
    const interval = setInterval(sendPresence, 15000);
    return () => clearInterval(interval);
  }, [joined, roomId, username, sendPresence]);

  useEffect(() => {
    if (!joined || !roomId) return;
    const onBeforeUnload = () => leaveRoom(roomId);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [joined, roomId, leaveRoom]);

  useEffect(() => {
    if (!isLoggedIn || joined) return;
    fetchMyRooms();
  }, [isLoggedIn, joined, fetchMyRooms]);

  useEffect(() => {
    if (!joined || !roomId || !showSidebar) return;
    fetchRoomFacts();
    const interval = setInterval(() => {
      fetchRoomFacts({ silent: true }).catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [joined, roomId, showSidebar, fetchRoomFacts]);



  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      const lastMsg = messages[messages.length - 1];
      const isFromMe = lastMsg?.sender === username;
      if (isNearBottom || isFromMe || messages.length <= 1) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, username]);

  const handleCopyRoomId = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedRoomId(true);
      setTimeout(() => setCopiedRoomId(false), 1500);
    } catch {
      setLastError('Failed to copy Room ID.');
    }
  };

  const createRoom = async () => {
    if (creatingRoom) return;
    const userToUse = username || joinUsernameInput.trim();
    if (!userToUse) {
      alert('Please enter a username');
      return;
    }
    setCreatingRoom(true);
    try {
      const res = await fetch('/api/chat?action=create');
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) {
        let message = 'Failed to create room. Please try again.';
        const data = await res.json().catch(() => null);
        if (data?.error) {
          message = data.error;
          if (Array.isArray(data.details) && data.details.length > 0) {
            message = `${message} ${data.details.join(' ')}`;
          }
        }
        setLastError(message);
        alert(message);
        return;
      }
      const data = await res.json();
      if (!data?.roomId || typeof data.roomId !== 'string') {
        const message = data?.onyxError || 'Failed to create room. Please try again.';
        setLastError(message);
        alert(message);
        return;
      }
      if (data?.onyxError) {
        setLastError(data.onyxError);
      } else {
        setLastError('');
      }
      if (typeof data.openingScene === 'string' && data.openingScene.trim()) {
        setMessages([{
          id: `opening-scene-${Date.now()}`,
          role: 'assistant',
          content: data.openingScene.trim(),
          timestamp: Date.now(),
          sender: 'Narrator'
        }]);
      } else {
        setMessages([]);
      }
      setRoomFacts([]);
      setRoomId(data.roomId);
      setRoomTitle(typeof data.roomTitle === 'string' && data.roomTitle.trim() ? data.roomTitle : 'Valle Verde Simulation');
      setRoomRole(data.roomRole === 'admin' ? 'admin' : 'member');
      setChatMode('ai');
      setUsername(userToUse);
      setJoined(true);
      sendPresence(data.roomId, userToUse);
    } catch {
      setLastError('Failed to create room. Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const joinRoom = async (overrideRoomId?: string) => {
    const userToUse = username || joinUsernameInput.trim();
    const roomToUse = (typeof overrideRoomId === 'string' ? overrideRoomId : joinRoomIdInput).trim();

    if (!userToUse) {
      alert('Please enter username');
      return;
    }
    if (!roomToUse) {
      alert('Please enter Room ID');
      return;
    }
    try {
      const res = await fetch(`/api/chat?roomId=${encodeURIComponent(roomToUse)}`);
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (res.ok) {
        setRoomId(roomToUse);
        setRoomTitle('Valle Verde Simulation');
        setRoomRole('member');
        setChatMode('ai');
        setRoomFacts([]);
        setUsername(userToUse);
        setJoined(true);
        setLastError('');
        sendPresence(roomToUse, userToUse);
      } else {
        alert('Room not found');
      }
    } catch {
      alert('Error joining room');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !roomId) return;
    const userMsg = input.trim();
    setInput('');
    setLoading(true);
    try {
      const payload =
        chatMode === 'room'
          ? { action: 'broadcast', content: userMsg, roomId }
          : { content: userMsg, roomId, targetRole };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      let data: Record<string, unknown> | null = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) {
        let message = 'Message failed to send. Please try again.';
        if (data?.error) {
          message = data.error as string;
          if (Array.isArray(data.details) && data.details.length > 0) {
            message = `${message} ${(data.details as string[]).join(' ')}`;
          }
        }
        setLastError(message);
      } else if (data?.error) {
        setLastError(data.error as string);
      } else {
        setLastError('');
      }
      await fetchMessages();
    } catch {
      setLastError('Message failed to send. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Proposal/Voting ──────────────────────────────────────────────
  const handleCreateProposal = async () => {
    if (roomRole !== 'admin') {
      setLastError('Only room admins can create votes.');
      return;
    }
    if (!newProposalTitle.trim()) { alert('Please enter a proposal title'); return; }
    const validOptions = newProposalOptions.filter((o) => o.trim());
    if (validOptions.length < 2) { alert('Please provide at least 2 options'); return; }
    setCreatingProposal(true);
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create', roomId,
          title: newProposalTitle.trim(),
          description: newProposalDescription.trim(),
          options: validOptions,
          createdBy: username,
          durationHours: voteDuration,
        }),
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (res.ok) {
        setShowCreateProposal(false);
        setNewProposalTitle('');
        setNewProposalDescription('');
        setNewProposalOptions([...defaultProposalOptions]);
        await fetchMessages();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create proposal');
      }
    } catch { alert('Failed to create proposal'); }
    finally { setCreatingProposal(false); }
  };

  const handleVote = async (proposalId: string, optionId: string) => {
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vote', roomId, proposalId, username, optionId }),
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to cast vote');
      }
      await fetchMessages();
    } catch { console.error('Failed to cast vote'); }
  };

  const handleCloseVoting = async (proposalId: string) => {
    if (roomRole !== 'admin') {
      setLastError('Only room admins can close votes.');
      return;
    }
    setClosingProposal(proposalId);
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', roomId, proposalId, requestAIResponse: false }),
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || data.details || 'Failed to close voting');
      }
      await fetchMessages();
    } catch { console.error('Failed to close voting'); }
    finally { setClosingProposal(null); }
  };

  const addProposalOption = () => setNewProposalOptions([...newProposalOptions, '']);
  const updateProposalOption = (index: number, value: string) => {
    const updated = [...newProposalOptions];
    updated[index] = value;
    setNewProposalOptions(updated);
  };
  const removeProposalOption = (index: number) => {
    if (newProposalOptions.length > 3) setNewProposalOptions(newProposalOptions.filter((_, i) => i !== index));
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const email = joinUsernameInput.trim().toLowerCase();
    const password = joinPasswordInput;

    if (!email || !password) {
      setAuthError('Please enter both email and password.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          email,
          password,
          allowCreate: true
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.user) {
        setAuthError(data?.error || 'Failed to sign in.');
        return;
      }

      const identity =
        (typeof data.user.email === 'string' && data.user.email.trim()) ||
        (typeof data.user.username === 'string' && data.user.username.trim()) ||
        (typeof data.user.displayName === 'string' && data.user.displayName.trim()) ||
        email;

      setUsername(identity);
      setJoinUsernameInput(typeof data.user.email === 'string' ? data.user.email : email);
      setJoinPasswordInput('');
      setIsLoggedIn(true);
      setAuthError('');
    } catch {
      setAuthError('Failed to sign in.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (joined && roomId) {
      leaveRoom(roomId);
    }

    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
      });
    } catch {
      // best-effort logout
    }

    setJoined(false);
    setRoomId('');
    setMessages([]);
    setActiveProposals([]);
    setRoomFacts([]);
    setParticipants([]);
    setTypingUsers({});
    setUsername('');
    setJoinPasswordInput('');
    setMyRooms([]);
    setAuthError('');
    setIsLoggedIn(false);
  };

  const handleRenameRoom = async () => {
    if (!roomId || roomRole !== 'admin' || renamingRoom) {
      return;
    }

    const nextTitle = window.prompt('Enter new room name', roomTitle)?.trim();
    if (!nextTitle || nextTitle === roomTitle) return;

    setRenamingRoom(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });

      if (res.status === 401) {
        handleSessionExpired();
        return;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLastError(data?.error || 'Failed to rename room.');
        return;
      }

      if (typeof data?.title === 'string' && data.title.trim()) {
        setRoomTitle(data.title);
      }
      setLastError('');
      fetchMyRooms();
    } catch {
      setLastError('Failed to rename room.');
    } finally {
      setRenamingRoom(false);
    }
  };

  if (authLoading && !isLoggedIn) {
    return (
      <div className="bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full bg-sage-500 animate-pulse" />
          Restoring session...
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // LOGIN SCREEN (matches IDEAL UI 2)
  // ═══════════════════════════════════════════════════════════════════
  if (!isLoggedIn) {
    return (
      <div className="bg-slate-50 font-sans min-h-screen flex flex-col items-center justify-center text-slate-600 relative overflow-hidden">
        {/* Background blurs */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-sage-200/20 rounded-full blur-3xl -translate-y-1/2" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-navy-100/30 rounded-full blur-3xl translate-y-1/2" />
        </div>

        <div className="w-full max-w-md p-6 z-10 relative">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-navy-900 text-white flex items-center justify-center shadow-lg mb-4">
              <Icon name="science" className="text-2xl" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Climate Sandbox</h1>
            <p className="text-sm text-slate-500 mt-2 text-center">Collaborative policy simulation platform</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-float border border-slate-200 p-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2" htmlFor="username">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="username"
                    type="text"
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50 text-slate-900 shadow-sm focus:border-navy-700 focus:ring-navy-700 text-sm pl-10 py-2.5 transition-colors"
                    placeholder="researcher@institute.org"
                    value={joinUsernameInput}
                    onChange={(e) => setJoinUsernameInput(e.target.value)}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Icon name="person" className="text-lg text-slate-400" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50 text-slate-900 shadow-sm focus:border-navy-700 focus:ring-navy-700 text-sm pl-10 py-2.5 transition-colors"
                    placeholder="••••••••"
                    value={joinPasswordInput}
                    onChange={(e) => setJoinPasswordInput(e.target.value)}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Icon name="lock" className="text-lg text-slate-400" />
                  </div>
                </div>
              </div>

              {authError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {authError}
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center">
                  <input id="remember-me" type="checkbox" className="h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-700" />
                  <label htmlFor="remember-me" className="ml-2 block text-slate-600 text-xs">Remember me</label>
                </div>
                <button type="button" className="text-navy-700 hover:text-navy-900 font-medium text-xs"></button>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 disabled:bg-slate-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-navy-700 transition-all duration-200 transform active:scale-[0.98]"
              >
                {authLoading ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-400 text-xs">or continue with</span>
                </div>
              </div>

              <button type="button" disabled className="w-full inline-flex justify-center items-center py-2.5 px-4 border border-slate-200 rounded-lg shadow-sm bg-white text-sm font-medium text-slate-400 cursor-not-allowed transition-colors">
                <Icon name="business" className="text-lg mr-2 text-slate-500" />
                Organization Login (Coming Soon)
              </button>
            </form>
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            {/* © 2024 Climate Sandbox Initiative. Authorized access only. */}
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD SCREEN (Matches IDEAL UI 3)
  // ═══════════════════════════════════════════════════════════════════
  if (isLoggedIn && !joined) {
    return (
      <div className="bg-background-light font-sans h-screen flex overflow-hidden text-slate-600">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20">
          <div className="h-16 flex items-center px-6 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-navy-900 text-white flex items-center justify-center shadow-sm">
                <Icon name="science" className="text-lg" />
              </div>
              <h1 className="font-bold text-slate-800 text-sm leading-tight">Climate Sandbox</h1>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8">
            <div className="space-y-1">
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-900 bg-slate-100 rounded-lg group transition-colors">
                <Icon name="dashboard" className="text-sage-600" />
                My Simulations
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg group transition-colors">
                <Icon name="library_books" className="text-slate-400 group-hover:text-slate-600" />
                Organization Library
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg group transition-colors">
                <Icon name="archive" className="text-slate-400 group-hover:text-slate-600" />
                Archives
              </button>
            </div>
            <div>
              <h3 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Workspace</h3>
              <div className="space-y-1">
                <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg group transition-colors">
                  <Icon name="settings" className="text-slate-400 group-hover:text-slate-600" />
                  Settings
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg group transition-colors">
                  <Icon name="people" className="text-slate-400 group-hover:text-slate-600" />
                  Team Management
                </button>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                {username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{username}</p>
                <p className="text-xs text-slate-500 truncate">Policy Analyst</p>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600">
                <Icon name="logout" className="text-xl" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Dashboard Content */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-50/50">
          <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
            <h2 className="text-lg font-semibold text-slate-800">Dashboard</h2>
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                  <Icon name="search" className="text-slate-400 text-lg group-focus-within:text-sage-600 transition-colors" />
                </div>
                {/* Join Room Input integrated into Search for convenience, or separate? Let's use it as 'Enter Room ID' */}
                <input
                  type="text"
                  placeholder="Enter Room ID to join..."
                  className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-sage-500 focus:border-sage-500 w-64 shadow-sm transition-all"
                  value={joinRoomIdInput}
                  onChange={(e) => setJoinRoomIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                />
              </div>
              <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <Icon name="notifications" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-slate-50"></span>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Active Simulations Grid */}
              <section>
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Active Simulations</h3>
                    <p className="text-sm text-slate-500 mt-1">Manage your ongoing policy workshops and sandboxes.</p>
                  </div>
                  <div className="flex gap-2">
                     {/* Join Button for Manual Room ID */}
                     {joinRoomIdInput && (
                      <button onClick={() => joinRoom()} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-navy-900 rounded-lg hover:bg-navy-800 transition-all shadow-sm fade-in">
                        <Icon name="login" className="text-sm" />
                        Join Room {joinRoomIdInput}
                      </button>
                     )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {/* Create New Card */}
                  <button
                    type="button"
                    onClick={createRoom}
                    disabled={creatingRoom}
                    className={`group relative flex w-full flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all h-full min-h-[220px] ${
                      creatingRoom
                        ? 'border-sage-300 bg-sage-50/70 cursor-not-allowed'
                        : 'border-slate-300 hover:border-sage-500 hover:bg-sage-50/50 cursor-pointer'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${creatingRoom ? 'bg-sage-100' : 'bg-slate-100 group-hover:bg-sage-100'}`}>
                      <Icon name={creatingRoom ? 'hourglass_top' : 'add'} className={`text-2xl ${creatingRoom ? 'text-sage-600 animate-pulse' : 'text-slate-400 group-hover:text-sage-600'}`} />
                    </div>
                    <h4 className={`font-semibold text-slate-900 mb-1 ${creatingRoom ? 'text-sage-700' : 'group-hover:text-sage-700'}`}>
                      {creatingRoom ? 'Preparing Valle Verde...' : 'Create New Simulation'}
                    </h4>
                    <p className="text-xs text-center text-slate-500 px-4">
                      {creatingRoom
                        ? 'Room setup in progress. Please wait for the narrator to open the scene.'
                        : 'Initialize a new scenario with custom variables and AI agents.'}
                    </p>
                  </button>

                  {roomsLoading && (
                    <div className="bg-white rounded-xl p-5 shadow-soft border border-slate-200 flex items-center justify-center min-h-[220px]">
                      <p className="text-sm text-slate-500">Loading your rooms...</p>
                    </div>
                  )}

                  {!roomsLoading &&
                    myRooms.slice(0, 7).map((room) => (
                      <div key={room.roomId} className="bg-white rounded-xl p-5 shadow-soft hover:shadow-float border border-slate-200 transition-all flex flex-col h-full relative group">
                        <div className="absolute top-5 right-5 flex gap-1">
                          <span className={`w-2 h-2 rounded-full ${room.roomStatus === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        </div>
                        <div className="mb-4">
                          <span className="inline-block px-2 py-1 rounded-md text-[10px] font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 mb-2">
                            {room.role.toUpperCase()}
                          </span>
                          <h4 className="font-bold text-slate-900 text-lg leading-tight mb-1 line-clamp-2">{room.title}</h4>
                          <p className="text-xs text-slate-500 font-mono">
                            ID: {room.roomId.slice(0, 8)}...{room.roomId.slice(-4)}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Last active {new Date(room.lastSeenAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="mt-auto pt-4 flex items-center justify-between border-t border-slate-100 gap-2">
                          <button
                            onClick={() => joinRoom(room.roomId)}
                            className="flex-1 px-3 py-1.5 bg-navy-900 text-white text-xs font-medium rounded-md hover:bg-navy-800 transition-colors shadow-sm"
                          >
                            Rejoin
                          </button>
                          <button
                            onClick={() => {
                              setJoinRoomIdInput(room.roomId);
                              navigator.clipboard.writeText(room.roomId).catch(() => undefined);
                            }}
                            className="px-2.5 py-1.5 border border-slate-200 rounded-md text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
                            title="Copy Room ID"
                          >
                            <Icon name="content_copy" className="text-sm" />
                          </button>
                        </div>
                      </div>
                    ))}

                  {!roomsLoading && myRooms.length === 0 && (
                    <div className="bg-white rounded-xl p-5 shadow-soft border border-slate-200 flex items-center justify-center min-h-[220px]">
                      <p className="text-sm text-slate-500 text-center">
                        No previous simulations yet. Create your first Valle Verde room.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Join Simulation Section - Replaces Analytics/Invites */}
              <section className="mt-8 bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8 transition-all hover:shadow-md">
                <div className="flex-1">
                   <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                         <Icon name="groups" className="text-indigo-600 text-xl" />
                      </div>
                      <h3 className="font-bold text-slate-800 text-xl">Join an Existing Simulation</h3>
                   </div>
                   <p className="text-slate-500 text-sm ml-13 max-w-md">Enter the unique Room ID to connect to a secure collaborative policy session or workshop.</p>
                </div>

                <div className="flex-1 w-full max-w-lg">
                   <div className="flex group bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100/50 transition-all">
                      <input
                        type="text"
                        placeholder="Enter Room ID to join..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 font-mono text-lg px-4 py-2 placeholder:text-slate-400"
                        value={joinRoomIdInput}
                        onChange={(e) => setJoinRoomIdInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                      />
                      <button
                        onClick={() => joinRoom()}
                        disabled={!joinRoomIdInput.trim()}
                        className="bg-navy-900 text-white px-8 py-3 rounded-lg font-semibold text-sm hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2 transform active:scale-95"
                      >
                        Join Session
                        <Icon name="login" className="text-lg" />
                      </button>
                   </div>
                </div>
              </section>
            </div>
          </div>
        </main>

        {creatingRoom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-md px-4">
            <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200/70 bg-white/95 shadow-[0_30px_80px_-20px_rgba(2,6,23,0.45)]">
              <div className="pointer-events-none absolute -left-16 -top-16 h-52 w-52 rounded-full bg-emerald-200/40 blur-3xl" />
              <div className="pointer-events-none absolute -right-10 -bottom-10 h-56 w-56 rounded-full bg-navy-100/70 blur-3xl" />

              <div className="relative grid grid-cols-1 md:grid-cols-5">
                <div className="md:col-span-2 p-4">
                  <div className="relative h-44 md:h-full min-h-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
                    <Image
                      src="/charcters/Valle_Verde.png"
                      alt="Valle Verde simulation landscape"
                      fill
                      priority
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/15 to-transparent" />
                    <div className="absolute left-3 bottom-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-200/90">Climate Sandbox</p>
                      <p className="text-sm font-semibold text-white">Valle Verde</p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-3 p-6 md:p-7">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sage-200 bg-sage-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sage-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
                    Simulation Booting
                  </div>

                  <h3 className="mt-4 text-2xl font-bold text-slate-900 tracking-tight">Valle Verde is setting up...</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Building the opening scene, loading stakeholders, and preparing your collaborative room.
                  </p>

                  <div className="mt-6 space-y-3">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-sage-500 via-emerald-500 to-teal-500 animate-pulse" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Generating opening narrative</span>
                      <span className="font-mono">Please wait...</span>
                    </div>
                  </div>

                  <p className="mt-6 text-xs text-slate-500">
                    Please avoid clicking multiple times. Room creation is in progress.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHAT / SIMULATION SCREEN (matches IDEAL UI 1 & 4)
  // ═══════════════════════════════════════════════════════════════════
  const typingUserList = Object.keys(typingUsers);
  const initials = username.slice(0, 2).toUpperCase();

  // Derive connected users from message senders
  const connectedUsers = Array.from(
    new Set(
      (participants.length > 0
        ? participants
        : messages
            .filter(m => m.sender && m.role !== 'system' && m.role !== 'assistant')
            .map(m => m.sender!)
      )
    )
  );
  // Ensure current user is always first
  if (!connectedUsers.includes(username)) connectedUsers.unshift(username);
  else {
    const idx = connectedUsers.indexOf(username);
    if (idx > 0) { connectedUsers.splice(idx, 1); connectedUsers.unshift(username); }
  }

  const avatarColors = ['bg-navy-900', 'bg-sage-600', 'bg-amber-600', 'bg-teal-600', 'bg-rose-500', 'bg-blue-600', 'bg-slate-700'];
  const getAvatarColor = (idx: number) => avatarColors[idx % avatarColors.length];

  return (
    <div className="bg-background-light font-sans h-screen flex flex-col overflow-hidden text-text-light transition-colors duration-200">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="bg-card-light border-b border-slate-200 h-14 shrink-0 flex items-center justify-between px-6 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-navy-900 text-white flex items-center justify-center shadow-sm">
              <Icon name="science" className="text-lg" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-900 text-sm">Climate Sandbox</h1>
                <span className="text-slate-300">/</span>
                <span className="font-semibold text-slate-700 text-sm truncate max-w-[200px]">{roomTitle}</span>
                {roomRole === 'admin' && (
                  <button
                    onClick={handleRenameRoom}
                    disabled={renamingRoom}
                    className="ml-1 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-navy-700 transition-colors"
                    title="Rename Room"
                  >
                    <Icon name="edit" className="text-[14px]" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-medium tracking-wide text-slate-600 uppercase">
                    Simulation Active
                  </span>
                </div>
                <span className="text-slate-300">|</span>
                <button
                  onClick={handleCopyRoomId}
                  className="text-[10px] font-mono text-slate-500 hover:text-navy-700 transition-colors flex items-center gap-1 group bg-transparent hover:bg-slate-50 px-1.5 py-0.5 rounded border border-transparent hover:border-slate-200"
                  title="Click to copy Room ID"
                >
                  <span className="opacity-50">ID:</span> {roomId.slice(0, 8)}...
                  <Icon name="content_copy" className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" />
                  {copiedRoomId && (
                    <span className="ml-1 text-[10px] font-sans text-emerald-600 font-medium">Copied</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Participants Section */}
          <div className="hidden md:flex items-center gap-3 pl-6 border-l border-slate-200 h-8">
            {/* Stacked Avatars */}
            <div className="flex -space-x-2">
              {connectedUsers.slice(0, 5).map((user, idx) => {
                const isYou = user === username;
                const userInitials = user.slice(0, 2).toUpperCase();
                return (
                  <div
                    key={user}
                    className={`w-7 h-7 rounded-full ${getAvatarColor(idx)} border-2 border-white flex items-center justify-center text-[10px] text-white font-bold relative z-[${10 - idx}] transition-transform hover:scale-110 hover:z-20`}
                    title={isYou ? `${user} (You)` : user}
                  >
                    {isYou ? initials : userInitials}
                  </div>
                );
              })}
              {connectedUsers.length > 5 && (
                <div className="w-7 h-7 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-[10px] text-slate-600 font-bold">
                  +{connectedUsers.length - 5}
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-muted-light">{connectedUsers.length} Active</span>

            {/* Typing Indicator */}
            {typingUserList.length > 0 && (
              <div className="flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-sage-500 typing-pip" />
                <span className="w-1.5 h-1.5 rounded-full bg-sage-500 typing-pip typing-pip-delay-1" />
                <span className="w-1.5 h-1.5 rounded-full bg-sage-500 typing-pip typing-pip-delay-2" />
                <span className="text-[10px] text-muted-light font-medium ml-0.5">
                  {typingUserList.join(', ')} typing...
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all border ${
              showSidebar
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-500 border-slate-200 hover:text-navy-900 hover:border-slate-300'
            }`}
            title={showSidebar ? 'Hide panel' : 'Show panel'}
          >
            <Icon name="dashboard" className="text-base" />
          </button>
          <button
            onClick={() => {
              leaveRoom(roomId);
              setJoined(false);
              setMessages([]);
              setRoomId('');
              setActiveProposals([]);
              setRoomFacts([]);
              setShowSidebar(false);
              setRoomTitle('Valle Verde Simulation');
              setRoomRole('member');
              setChatMode('ai');
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-500 border border-slate-200 hover:text-rose-600 hover:border-rose-300 transition-all"
            title="Exit Simulation"
          >
            <Icon name="logout" className="text-base" />
          </button>
        </div>
      </header>

      {/* ── Error Banner ──────────────────────────────────────────── */}
      {lastError && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 text-sm text-rose-700 flex items-center gap-2">
          <Icon name="error_outline" className="text-base text-rose-500" />
          {lastError}
          <button onClick={() => setLastError('')} className="ml-auto text-rose-400 hover:text-rose-600">
            <Icon name="close" className="text-base" />
          </button>
        </div>
      )}

      {/* ── Main Content Area ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Chat Area ───────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col relative bg-slate-50/30 chat-bg-pattern">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 relative pb-8" id="chat-container">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full fade-in-up">
                <div className="relative mb-6">
                  <div className="w-20 h-20 bg-white rounded-2xl shadow-soft border border-slate-200 flex items-center justify-center">
                    <Icon name="forum" className="text-4xl text-slate-300" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-sage-500 rounded-lg flex items-center justify-center shadow-sm">
                    <Icon name="add" className="text-sm text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-1">Ask a Stakeholder</h3>
                <p className="text-sm text-slate-400 max-w-sm text-center leading-relaxed">
                  Pick who you want to talk to, then type your question below. The selected character will respond in their voice.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-6">
                  {personas.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setTargetRole(p.label)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm transition-all text-xs font-medium ${
                        targetRole === p.label
                          ? 'bg-navy-900 text-white border-navy-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded ${p.color} flex items-center justify-center`}>
                        <Icon name={p.icon} className="text-[8px] text-white" />
                      </div>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, index) => {
              const isMe = msg.sender === username;
              const isAssistant = msg.role === 'assistant';
              const isSystem = msg.role === 'system';

              // ── System messages ──
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center py-2">
                    <div className="bg-slate-100 backdrop-blur-sm rounded-full px-3 py-1 text-[10px] font-medium text-slate-500 flex items-center gap-2 border border-slate-200">
                      <Icon name="sync" className="text-[12px]" />
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // ── User messages (sent by me) ──
              if (isMe) {
                const targetPersona = personas.find(p => p.label === msg.targetRole);
                return (
                  <div key={msg.id} className="group flex justify-end fade-in-up">
                    <div className="flex flex-col items-end max-w-2xl w-full">
                      {/* Sender → Recipient header */}
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs font-bold text-slate-700">You</span>
                        <Icon name="arrow_forward" className="text-[10px] text-slate-400" />
                        {targetPersona ? (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-4 h-4 rounded ${targetPersona.color} flex items-center justify-center`}>
                              <Icon name={targetPersona.icon} className="text-[8px] text-white" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">{msg.targetRole}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Everyone</span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-2">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {/* Bubble */}
                      <div className="bg-navy-900 text-white p-4 rounded-2xl rounded-tr-sm shadow-soft relative">
                        <p className="leading-relaxed text-sm">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Other user messages ──
              if (!isAssistant && !isMe) {
                const otherInitials = (msg.sender || 'U').slice(0, 2).toUpperCase();
                const otherTargetPersona = personas.find(p => p.label === msg.targetRole);
                return (
                  <div key={msg.id} className="group flex justify-start fade-in-up">
                    <div className="flex flex-col items-start max-w-2xl w-full">
                      {/* Sender → Recipient header */}
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs font-bold text-slate-700">{msg.sender || 'User'}</span>
                        <Icon name="arrow_forward" className="text-[10px] text-slate-400" />
                        {otherTargetPersona ? (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-4 h-4 rounded ${otherTargetPersona.color} flex items-center justify-center`}>
                              <Icon name={otherTargetPersona.icon} className="text-[8px] text-white" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">{msg.targetRole}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Everyone</span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-2">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-sage-600 flex items-center justify-center text-[10px] text-white font-bold shrink-0 shadow-sm">
                          {otherInitials}
                        </div>
                        <div className="bg-white text-slate-800 p-4 rounded-2xl rounded-tl-sm shadow-soft border border-slate-200/80 relative">
                          <p className="leading-relaxed text-sm">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Assistant / Character responses ──
              if (isAssistant) {
                const character = getRespondingCharacter(index);
                const charPersona = character.persona;
                const borderColor = personaBorderColors[character.role] || '#588168';
                return (
                  <div key={msg.id} className="group relative fade-in-up">
                    <div className="flex gap-3">
                      {/* Character Avatar */}
                      <div className="shrink-0">
                        <div className={`w-10 h-10 rounded-xl ${charPersona.color} text-white flex items-center justify-center shadow-lg border border-white/10`}>
                          <Icon name={charPersona.icon} className="text-lg" />
                        </div>
                      </div>
                      {/* Content */}
                      <div className="flex flex-col max-w-3xl w-full">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-800">{character.role}</span>
                            <Icon name="arrow_forward" className="text-[10px] text-slate-400" />
                            <span className="text-xs text-slate-500">{character.askedBy === username ? 'You' : character.askedBy}</span>
                            {msg.proposalId && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-sage-100 text-sage-700 border border-sage-200">
                                VOTE RESPONSE
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="bg-white rounded-xl rounded-tl-sm p-5 shadow-soft border border-slate-200/80" style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}>
                          <div className="prose prose-sm prose-slate max-w-none break-words text-slate-600 leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* Loading / AI Thinking */}
            {(chatMode === 'ai' ? (loading || aiThinking) : loading) && (
              <div className="group relative">
                <div className="flex gap-3">
                  <div className="shrink-0">
                    <div className={`w-10 h-10 rounded-xl ${chatMode === 'ai' ? currentPersona.color : 'bg-sage-700'} text-white flex items-center justify-center shadow-lg border border-white/10`}>
                      <Icon name={chatMode === 'ai' ? currentPersona.icon : 'groups'} className="text-lg" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-600 mb-1.5">{chatMode === 'ai' ? targetRole : 'Room Chat'}</span>
                    <div className="bg-white rounded-xl rounded-tl-sm px-6 py-4 shadow-soft border border-slate-200 flex items-center gap-3">
                      <div className="flex gap-1.5 h-3 items-center">
                        <div className="w-2 h-2 bg-navy-700 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-2 h-2 bg-navy-700 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-2 h-2 bg-navy-700 rounded-full animate-bounce" />
                      </div>
                      <span className="text-xs text-slate-400">{chatMode === 'ai' ? 'is thinking...' : 'sending...'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Bar ─────────────────────────────────────────── */}
          <div className="shrink-0 z-30 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pt-4 pb-4 px-5 border-t border-slate-200/70">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={sendMessage}>
                <div className="bg-white rounded-2xl shadow-float border border-slate-200/80 p-1.5 flex items-end gap-1.5 relative ring-1 ring-slate-900/5 transition-shadow focus-within:shadow-lg focus-within:ring-sage-500/20 focus-within:border-sage-300">
                  <div className="shrink-0 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setChatMode('ai');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                          chatMode === 'ai'
                            ? 'bg-navy-900 text-white border-navy-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        AI Scene
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChatMode('room');
                          setShowAddressingDropdown(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                          chatMode === 'room'
                            ? 'bg-sage-700 text-white border-sage-700'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Room Chat
                      </button>
                    </div>

                    {chatMode === 'ai' ? (
                      <div className="relative h-10 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowAddressingDropdown(!showAddressingDropdown)}
                          className={`flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl transition-all h-full border ${
                            showAddressingDropdown
                              ? 'bg-slate-200 border-slate-300'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md ${currentPersona.color} flex items-center justify-center text-white text-[10px] shadow-sm`}>
                            <Icon name={currentPersona.icon} className="text-xs" />
                          </div>
                          <div className="flex flex-col items-start mr-0.5">
                            <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider leading-none mb-0.5">To</span>
                            <span className="text-xs font-bold text-slate-700 leading-none">{targetRole}</span>
                          </div>
                          <Icon name={showAddressingDropdown ? 'expand_less' : 'expand_more'} className="text-sm text-slate-400" />
                        </button>

                        {showAddressingDropdown && (
                          <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-float border border-slate-200 py-1.5 w-60 z-50 fade-in-up">
                            <div className="px-3 py-1.5 mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Address message to</span>
                            </div>
                            {personas.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => {
                                  setTargetRole(p.label);
                                  setShowAddressingDropdown(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-all ${
                                  targetRole === p.label
                                    ? 'bg-sage-50 text-sage-800 font-semibold'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <div className={`w-7 h-7 rounded-lg ${p.color} flex items-center justify-center text-white shadow-sm`}>
                                  <Icon name={p.icon} className="text-sm" />
                                </div>
                                <span className="flex-1 text-left">{p.label}</span>
                                {targetRole === p.label && (
                                  <Icon name="check_circle" className="text-base text-sage-600" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <Icon name="groups" className="text-sm text-sage-700" />
                        To Everyone
                      </div>
                    )}
                  </div>

                  <div className="w-px h-9 bg-slate-200 shrink-0 self-center" />

                  {/* Text input */}
                  <textarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(e);
                      }
                    }}
                    placeholder={chatMode === 'room' ? 'Message everyone in the room...' : 'Ask a question or declare an action...'}
                    rows={1}
                    style={{ minHeight: '40px' }}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 placeholder-slate-400 resize-none py-2.5 max-h-32 text-sm outline-none leading-relaxed"
                    disabled={loading}
                  />

                  <div className="flex items-center gap-0.5 h-10 pb-0">
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className={`h-9 w-9 rounded-xl shadow-sm flex items-center justify-center transition-all active:scale-90 ml-0.5 ${
                        input.trim()
                          ? 'bg-navy-900 hover:bg-navy-800 text-white shadow-md hover:shadow-lg'
                          : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      <Icon name="arrow_upward" className="text-base" />
                    </button>
                  </div>
                </div>
              </form>
              <div className="text-center mt-2">
                <p className="text-[10px] text-slate-400/70">AI can make mistakes. Verify critical climate data.</p>
              </div>
            </div>
          </div>
        </main>

        {/* ── Right Sidebar (toggleable) ─────────────────────────── */}
        {showSidebar && (
        <aside className="w-80 bg-white border-l border-slate-200 flex-col shrink-0 z-10 flex">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <h2 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2">
              <Icon name="dashboard" className="text-sm text-navy-700" />
              Simulation Panel
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Active Proposals / Contracts */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase">Active Votes</h3>
                <button
                  onClick={() => setShowCreateProposal(true)}
                  disabled={roomRole !== 'admin'}
                  title={roomRole === 'admin' ? 'Create vote' : 'Only admins can create votes'}
                  className="text-sage-600 hover:text-sage-700 disabled:text-slate-300 text-[10px] font-medium"
                >
                  + New
                </button>
              </div>
              <div className="space-y-3">
                {activeProposals.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic">No active votes</p>
                )}
                {activeProposals.map((proposal) => {
                  const totalVotes = Object.keys(proposal.votes).length;
                  const myVote = proposal.votes[username];
                  return (
                    <div
                      key={proposal.id}
                      className="bg-white border border-slate-200 rounded-lg p-3 relative overflow-hidden group hover:border-sage-300 transition-colors"
                    >
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-emerald-500" />
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-slate-700">{proposal.title}</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                          {proposal.status === 'active' ? 'Active' : 'Closed'}
                        </span>
                      </div>
                      {proposal.description && (
                        <p className="text-[10px] text-slate-500 line-clamp-2 mb-2">{proposal.description}</p>
                      )}
                      {proposal.status === 'active' && (
                        <p className="text-[10px] text-slate-400 mb-2">{formatTimeRemaining(proposal)}</p>
                      )}
                      {/* Options */}
                      <div className="space-y-1.5 mt-2">
                        {proposal.options.map((option) => {
                          const optionVotes = Object.values(proposal.votes).filter((v) => v === option.id).length;
                          const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
                          const isSelected = myVote === option.id;
                          return (
                            <button
                              key={option.id}
                              onClick={() => handleVote(proposal.id, option.id)}
                              className={`w-full relative overflow-hidden rounded p-2 text-left transition-all border text-[10px] ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-50'
                                  : 'border-slate-200 hover:border-emerald-300 bg-slate-50'
                              }`}
                            >
                              <div
                                className="absolute inset-0 bg-emerald-200 transition-all"
                                style={{ width: `${percentage}%`, opacity: 0.3 }}
                              />
                              <div className="relative flex justify-between items-center">
                                <span className={`font-medium ${isSelected ? 'text-emerald-700' : 'text-slate-600'}`}>
                                  {option.label}
                                </span>
                                <span className="text-slate-400">
                                  {optionVotes} ({percentage}%)
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {/* Close vote */}
                      <button
                        onClick={() => handleCloseVoting(proposal.id)}
                        disabled={closingProposal === proposal.id || roomRole !== 'admin'}
                        title={roomRole === 'admin' ? 'Close this vote' : 'Only admins can close votes'}
                        className="mt-2 w-full text-[10px] py-1 text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {closingProposal === proposal.id ? 'Closing...' : 'Close Vote'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Verified Facts */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase">Facts</h3>
                <button
                  onClick={() => fetchRoomFacts()}
                  className="text-sage-600 hover:text-sage-700 text-[10px] font-medium"
                  title="Refresh facts"
                >
                  Refresh
                </button>
              </div>
              <div className="space-y-2">
                {factsLoading && roomFacts.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic">Loading facts...</p>
                )}
                {!factsLoading && roomFacts.length === 0 && (
                  <div className="flex flex-col items-center py-4 text-center">
                    <Icon name="verified" className="text-2xl text-slate-200 mb-1" />
                    <p className="text-[10px] text-slate-400 italic">Facts will appear here as the simulation progresses</p>
                  </div>
                )}
                {roomFacts.map((fact) => {
                  const factId = fact.shortId || fact.id;
                  const metadata = [fact.createdBy ? `By ${fact.createdBy}` : null, fact.source ? `Source ${fact.source}` : null]
                    .filter(Boolean)
                    .join(' • ');
                  return (
                    <div key={fact.id} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2">
                      <p className="text-[9px] text-blue-600 mb-0.5 font-semibold uppercase tracking-wide">{factId}</p>
                      <p className="text-[10px] font-medium text-blue-900 leading-relaxed">{fact.fact}</p>
                      {metadata && <p className="mt-1 text-[9px] text-blue-700/80">{metadata}</p>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Previous Votes */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase">Previous Votes</h3>
              </div>
              <div className="space-y-2">
                {(() => {
                  const closed = activeProposals.filter(p => p.status === 'closed');
                  if (closed.length === 0) {
                    return <p className="text-[10px] text-slate-400 italic">No completed votes yet</p>;
                  }
                  return closed.map((proposal) => {
                    const totalVotes = Object.keys(proposal.votes).length;
                    let winnerLabel = 'No votes';
                    let winnerCount = 0;
                    if (totalVotes > 0) {
                      const counts: Record<string, number> = {};
                      Object.values(proposal.votes).forEach((optId) => { counts[optId] = (counts[optId] || 0) + 1; });
                      const winnerOptId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
                      winnerCount = counts[winnerOptId];
                      const winnerOpt = proposal.options.find(o => o.id === winnerOptId);
                      winnerLabel = winnerOpt?.label || winnerOptId;
                    }
                    return (
                      <div key={proposal.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[10px] font-semibold text-slate-700 mb-1">{proposal.title}</p>
                        <div className="flex items-center gap-1.5">
                          <Icon name="emoji_events" className="text-xs text-amber-500" />
                          <span className="text-[10px] font-medium text-slate-600">{winnerLabel}</span>
                          <span className="text-[10px] text-slate-400">({winnerCount}/{totalVotes} votes)</span>
                        </div>
                        {proposal.closedAt && (
                          <p className="text-[9px] text-slate-400 mt-1">
                            Closed {new Date(proposal.closedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </section>
          </div>
        </aside>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* VOTE MODAL (matches IDEAL UI 4)                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showCreateProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px]">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-slate-200 mx-4 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-slate-200 rounded-md">
                  <Icon name="ballot" className="text-sm text-slate-600" />
                </div>
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Initiate Proposal</h3>
              </div>
              <button
                onClick={() => {
                  setShowCreateProposal(false);
                  setNewProposalTitle('');
                  setNewProposalDescription('');
                  setNewProposalOptions([...defaultProposalOptions]);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Icon name="close" className="text-lg" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                  Proposal Name
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 text-sm focus:ring-navy-800 focus:border-navy-800 placeholder-slate-400 py-2.5 px-3 shadow-sm"
                  placeholder="e.g. Phase 2 Water Restrictions"
                  value={newProposalTitle}
                  onChange={(e) => setNewProposalTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                  Description
                </label>
                <textarea
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 text-sm focus:ring-navy-800 focus:border-navy-800 placeholder-slate-400 py-2.5 px-3 shadow-sm resize-none h-24 leading-relaxed"
                  placeholder="Provide context for the stakeholders regarding the impact of this proposal..."
                  value={newProposalDescription}
                  onChange={(e) => setNewProposalDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                  Voting Options
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {newProposalOptions.map((option, idx) => {
                    const preset = proposalOptionPresets[idx] || {
                      icon: 'radio_button_unchecked',
                      bg: 'bg-white',
                      border: 'border-slate-200',
                      text: 'text-slate-600'
                    };
                    return (
                      <div
                        key={idx}
                        className={`relative flex items-center gap-2 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-navy-100 ${preset.bg} ${preset.border} ${preset.text}`}
                      >
                        <Icon name={preset.icon} className="text-sm" />
                        <input
                          type="text"
                          className={`w-full bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400 ${preset.text}`}
                          placeholder={defaultProposalOptions[idx] || `Option ${idx + 1}`}
                          value={option}
                          onChange={(e) => updateProposalOption(idx, e.target.value)}
                        />
                        {newProposalOptions.length > 3 && idx >= 3 && (
                          <button
                            type="button"
                            onClick={() => removeProposalOption(idx)}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-500 shadow-sm flex items-center justify-center"
                          >
                            <Icon name="close" className="text-xs" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={addProposalOption}
                    className="text-xs font-medium text-navy-700 hover:text-navy-900 flex items-center gap-1 transition-colors opacity-70 hover:opacity-100"
                  >
                    <Icon name="add_circle" className="text-sm" /> Add Custom Option
                  </button>
                </div>
              </div>

              {/* Duration */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Voting Duration</label>
                  <span className="text-xs font-mono font-medium text-navy-800 bg-navy-50 px-2 py-0.5 rounded">
                    {voteDuration} Hours
                  </span>
                </div>
                <div className="px-1">
                  <input
                    type="range"
                    min="1"
                    max="72"
                    value={voteDuration}
                    onChange={(e) => setVoteDuration(Number(e.target.value))}
                    className="w-full bg-transparent focus:outline-none focus:ring-0"
                  />
                  <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    <span>1 Hour</span>
                    <span>3 Days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => {
                  setShowCreateProposal(false);
                  setNewProposalTitle('');
                  setNewProposalDescription('');
                  setNewProposalOptions([...defaultProposalOptions]);
                }}
                className="px-5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProposal}
                disabled={creatingProposal}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg shadow-md transition-all transform active:scale-95 flex items-center gap-2 disabled:opacity-50"
              >
                {creatingProposal ? 'Launching...' : 'Launch Vote'}
                <Icon name="rocket_launch" className="text-sm" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
