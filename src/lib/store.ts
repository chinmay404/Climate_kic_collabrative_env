import fs from 'fs';
import path from 'path';

// Define the shape of a vote option
export interface VoteOption {
  id: string;
  label: string;
}

// Define the shape of a proposal/vote
export interface Proposal {
  id: string;
  title: string;
  description: string;
  options: VoteOption[];
  votes: Record<string, string>; // username -> optionId
  createdBy: string;
  createdAt: number;
  durationHours: number;
  endsAt: number;
  status: 'active' | 'closed';
  closedAt?: number;
  aiResponseMessageId?: string; // ID of the AI message responding to the decision
}

// Define the shape of a message
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sender?: string; // "Who talked what"
  proposalId?: string; // Reference to a proposal if this message is related
  targetRole?: string; // selected persona (e.g., Narrator, Farmers)
}

export interface Room {
  id: string;
  messages: Message[];
  proposals: Record<string, Proposal>; // proposalId -> Proposal
  sessionId: string | null; // Onyx session ID specific to this room
  createdAt: number;
  currentRole?: string; // last selected persona for this room
  aiThinking?: boolean;
  typingUsers?: Record<string, number>; // username -> timestamp(ms)
  participants?: Record<string, number>; // username -> last seen timestamp(ms)
}

interface Database {
  rooms: Record<string, Room>;
}

const IS_SERVERLESS = Boolean(
  process.env.NETLIFY ||
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
);

const PRESENCE_TTL_MS = 45000;

const DB_PATH = IS_SERVERLESS
  ? path.join('/tmp', 'chat_db.json')
  : path.join(process.cwd(), 'chat_db.json');

let useMemoryOnly = false;
const memoryDB: Database = { rooms: {} };

// Initialize DB if not exists
try {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ rooms: {} }, null, 2));
  }
} catch {
  useMemoryOnly = true;
}

function getDB(): Database {
  if (useMemoryOnly) return memoryDB;
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    useMemoryOnly = true;
    return memoryDB;
  }
}

function saveDB(db: Database) {
  if (useMemoryOnly) {
    memoryDB.rooms = db.rooms;
    return;
  }
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch {
    useMemoryOnly = true;
    memoryDB.rooms = db.rooms;
  }
}

export function createRoom(sessionId: string | null = null): string {
  const db = getDB();
  // Create a simpler, friendlier ID (e.g., 6 digits)
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  db.rooms[id] = {
    id,
    messages: [],
    proposals: {},
    sessionId: sessionId,
    createdAt: Date.now(),
    currentRole: 'Narrator',
    aiThinking: false,
    typingUsers: {},
    participants: {}
  };
  saveDB(db);
  return id;
}

export function ensureRoom(roomId: string, sessionId: string | null = null): Room {
  const db = getDB();
  if (!db.rooms[roomId]) {
    db.rooms[roomId] = {
      id: roomId,
      messages: [],
      proposals: {},
      sessionId,
      createdAt: Date.now(),
      currentRole: 'Narrator',
      aiThinking: false,
      typingUsers: {},
      participants: {}
    };
    saveDB(db);
  } else if (sessionId && db.rooms[roomId].sessionId !== sessionId) {
    db.rooms[roomId].sessionId = sessionId;
    saveDB(db);
  }
  return db.rooms[roomId];
}

export function setAiThinking(roomId: string, isThinking: boolean) {
    const db = getDB();
    if (db.rooms[roomId]) {
        db.rooms[roomId].aiThinking = isThinking;
        saveDB(db);
    }
}

export function setUserTyping(roomId: string, username: string) {
    const db = getDB();
    if (db.rooms[roomId]) {
        if (!db.rooms[roomId].typingUsers) db.rooms[roomId].typingUsers = {};
        db.rooms[roomId].typingUsers[username] = Date.now();
        saveDB(db);
    }
}

export function setUserPresence(roomId: string, username: string) {
    const db = getDB();
    if (db.rooms[roomId]) {
        if (!db.rooms[roomId].participants) db.rooms[roomId].participants = {};
        db.rooms[roomId].participants![username] = Date.now();
        saveDB(db);
    }
}

export function getRoom(roomId: string): Room | null {
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room) return null;

  // Cleanup old typing users (> 3 seconds)
  if (room.typingUsers) {
      const now = Date.now();
      let changed = false;
      Object.keys(room.typingUsers).forEach(user => {
          if (now - room.typingUsers![user] > 3000) {
              delete room.typingUsers![user];
              changed = true;
          }
      });
      if (changed) saveDB(db);
  }

  if (room.participants) {
      const now = Date.now();
      let changed = false;
      Object.keys(room.participants).forEach(user => {
          if (now - room.participants![user] > PRESENCE_TTL_MS) {
              delete room.participants![user];
              changed = true;
          }
      });
      if (changed) saveDB(db);
  }
  
  return room;
}

export function addMessageToRoom(roomId: string, message: Omit<Message, 'id' | 'timestamp'>): Message | null {
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room) return null;

  const newMessage: Message = {
    ...message,
    id: Math.random().toString(36).substring(7),
    timestamp: Date.now(),
  };
  
  room.messages.push(newMessage);
  saveDB(db);
  return newMessage;
}

export function deleteRoom(roomId: string) {
  const db = getDB();
  if (db.rooms[roomId]) {
    delete db.rooms[roomId];
    saveDB(db);
  }
}

export function setRoomSessionId(roomId: string, sessionId: string) {
  const db = getDB();
  if (db.rooms[roomId]) {
    db.rooms[roomId].sessionId = sessionId;
    saveDB(db);
  }
}

export function setRoomCurrentRole(roomId: string, role: string) {
  const db = getDB();
  if (db.rooms[roomId]) {
    db.rooms[roomId].currentRole = role;
    saveDB(db);
  }
}

export function closeExpiredProposals(roomId: string): Proposal[] {
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room || !room.proposals) return [];

  const now = Date.now();
  const closed: Proposal[] = [];
  let changed = false;

  Object.values(room.proposals).forEach((proposal) => {
    if (!proposal.endsAt) {
      const fallbackDuration =
        Number.isFinite(proposal.durationHours) && proposal.durationHours > 0 ? proposal.durationHours : 24;
      proposal.durationHours = fallbackDuration;
      proposal.endsAt = proposal.createdAt + fallbackDuration * 60 * 60 * 1000;
      changed = true;
    }
    if (proposal.status === 'active' && now >= proposal.endsAt) {
      proposal.status = 'closed';
      proposal.closedAt = now;
      closed.push(proposal);
      changed = true;
    }
  });

  if (changed) saveDB(db);
  return closed;
}

// Proposal/Voting Functions

export function createProposal(
  roomId: string,
  title: string,
  description: string,
  options: { label: string }[],
  createdBy: string,
  durationHours = 24
): Proposal | null {
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room) return null;

  // Initialize proposals if needed
  if (!room.proposals) room.proposals = {};

  const proposalId = Math.random().toString(36).substring(2, 10).toUpperCase();
  const createdAt = Date.now();
  const safeDuration = Number.isFinite(durationHours) && durationHours > 0 ? durationHours : 24;
  const proposal: Proposal = {
    id: proposalId,
    title,
    description,
    options: options.map((opt, idx) => ({
      id: `opt_${idx}`,
      label: opt.label
    })),
    votes: {},
    createdBy,
    createdAt,
    durationHours: safeDuration,
    endsAt: createdAt + safeDuration * 60 * 60 * 1000,
    status: 'active'
  };

  room.proposals[proposalId] = proposal;
  saveDB(db);
  return proposal;
}

export function getProposal(roomId: string, proposalId: string): Proposal | null {
  closeExpiredProposals(roomId);
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room || !room.proposals) return null;
  return room.proposals[proposalId] || null;
}

export function getActiveProposals(roomId: string): Proposal[] {
  closeExpiredProposals(roomId);
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room || !room.proposals) return [];
  return Object.values(room.proposals).filter(p => p.status === 'active');
}

export function getAllProposals(roomId: string): Proposal[] {
  closeExpiredProposals(roomId);
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room || !room.proposals) return [];
  return Object.values(room.proposals).sort((a, b) => b.createdAt - a.createdAt);
}

export function castVote(
  roomId: string,
  proposalId: string,
  username: string,
  optionId: string
): { success: boolean; error?: string } {
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room || !room.proposals) return { success: false, error: 'Room not found' };

  const proposal = room.proposals[proposalId];
  if (!proposal) return { success: false, error: 'Proposal not found' };
  if (!proposal.endsAt) {
    const fallbackDuration =
      Number.isFinite(proposal.durationHours) && proposal.durationHours > 0 ? proposal.durationHours : 24;
    proposal.durationHours = fallbackDuration;
    proposal.endsAt = proposal.createdAt + fallbackDuration * 60 * 60 * 1000;
    saveDB(db);
  }
  if (proposal.endsAt && Date.now() >= proposal.endsAt) {
    proposal.status = 'closed';
    proposal.closedAt = Date.now();
    saveDB(db);
    return { success: false, error: 'Voting is closed' };
  }
  if (proposal.status !== 'active') return { success: false, error: 'Voting is closed' };

  // Validate option exists
  const optionExists = proposal.options.some(o => o.id === optionId);
  if (!optionExists) return { success: false, error: 'Invalid option' };

  // Cast/update vote
  proposal.votes[username] = optionId;
  saveDB(db);
  return { success: true };
}

export function closeProposal(
  roomId: string,
  proposalId: string,
  aiResponseMessageId?: string
): { success: boolean; error?: string; proposal?: Proposal } {
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room || !room.proposals) return { success: false, error: 'Room not found' };

  const proposal = room.proposals[proposalId];
  if (!proposal) return { success: false, error: 'Proposal not found' };

  proposal.status = 'closed';
  proposal.closedAt = Date.now();
  if (aiResponseMessageId) {
    proposal.aiResponseMessageId = aiResponseMessageId;
  }
  saveDB(db);
  return { success: true, proposal };
}

export function getVoteResults(roomId: string, proposalId: string): {
  proposal: Proposal | null;
  results: { optionId: string; label: string; count: number; voters: string[] }[];
  totalVotes: number;
  winner: { optionId: string; label: string; count: number } | null;
} | null {
  closeExpiredProposals(roomId);
  const db = getDB();
  const room = db.rooms[roomId];
  if (!room || !room.proposals) return null;

  const proposal = room.proposals[proposalId];
  if (!proposal) return null;

  // Count votes per option
  const voteCounts: Record<string, { count: number; voters: string[] }> = {};
  proposal.options.forEach(opt => {
    voteCounts[opt.id] = { count: 0, voters: [] };
  });

  Object.entries(proposal.votes).forEach(([username, optionId]) => {
    if (voteCounts[optionId]) {
      voteCounts[optionId].count++;
      voteCounts[optionId].voters.push(username);
    }
  });

  const results = proposal.options.map(opt => ({
    optionId: opt.id,
    label: opt.label,
    count: voteCounts[opt.id]?.count || 0,
    voters: voteCounts[opt.id]?.voters || []
  }));

  const totalVotes = Object.keys(proposal.votes).length;

  // Find winner (option with most votes)
  let winner: { optionId: string; label: string; count: number } | null = null;
  let maxVotes = 0;
  results.forEach(r => {
    if (r.count > maxVotes) {
      maxVotes = r.count;
      winner = { optionId: r.optionId, label: r.label, count: r.count };
    }
  });

  return { proposal, results, totalVotes, winner };
}
