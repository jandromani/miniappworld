export type Question = {
  id: number;
  prompt: string;
  answers: string[];
  correctIndex: number;
  prize: number;
};

export const questions: Question[] = [
  {
    id: 1,
    prompt: "¿Qué lenguaje se ejecuta en el navegador?",
    answers: ["Python", "JavaScript", "Go", "Rust"],
    correctIndex: 1,
    prize: 100,
  },
  {
    id: 2,
    prompt: "¿Qué comando instala dependencias en un proyecto npm?",
    answers: ["npm run", "npm init", "npm install", "npm compile"],
    correctIndex: 2,
    prize: 200,
  },
  {
    id: 3,
    prompt: "¿Qué red utiliza World Chain en testnet?",
    answers: ["Goerli", "Sepolia", "Mainnet", "Ropsten"],
    correctIndex: 1,
    prize: 300,
  },
  {
    id: 4,
    prompt: "¿Cuántas preguntas tiene el modo clásico 50x15?",
    answers: ["10", "12", "15", "20"],
    correctIndex: 2,
    prize: 500,
  },
  {
    id: 5,
    prompt: "¿Qué comando MiniKit se usa para pagos?",
    answers: ["verify", "pay", "walletAuth", "sendHapticFeedback"],
    correctIndex: 1,
    prize: 750,
  },
  {
    id: 6,
    prompt: "¿Qué librería facilita el uso de MiniKit en React?",
    answers: ["@worldcoin/minikit-react", "ethers", "wagmi", "alchemy-sdk"],
    correctIndex: 0,
    prize: 1000,
  },
  {
    id: 7,
    prompt: "¿Qué comodín elimina dos opciones?",
    answers: ["Público", "Cambio", "50/50", "Llamada"],
    correctIndex: 2,
    prize: 2000,
  },
  {
    id: 8,
    prompt: "¿Cuál es la unidad mínima de ETH?",
    answers: ["Gwei", "Wei", "Finney", "Szabo"],
    correctIndex: 1,
    prize: 3000,
  },
  {
    id: 9,
    prompt: "¿Qué componente Next habilita rutas /app?",
    answers: ["App Router", "Pages Router", "Server Actions", "Middleware"],
    correctIndex: 0,
    prize: 5000,
  },
  {
    id: 10,
    prompt: "¿Qué comando MiniKit vibra el dispositivo?",
    answers: ["pay", "sendHapticFeedback", "verify", "walletAuth"],
    correctIndex: 1,
    prize: 7500,
  },
  {
    id: 11,
    prompt: "¿Qué extensión de archivo se usa para Solidity?",
    answers: [".sol", ".eth", ".world", ".wld"],
    correctIndex: 0,
    prize: 10000,
  },
  {
    id: 12,
    prompt: "¿Qué cadena usa WLD como token?",
    answers: ["World Chain", "Bitcoin", "Solana", "Polkadot"],
    correctIndex: 0,
    prize: 20000,
  },
  {
    id: 13,
    prompt: "¿Qué variable env define el ID de la app?",
    answers: ["NEXT_PUBLIC_APP_ID", "APP_SECRET", "CHAIN_ID", "MINIKIT_ID"],
    correctIndex: 0,
    prize: 30000,
  },
  {
    id: 14,
    prompt: "¿Qué comando valida persona única?",
    answers: ["verify", "pay", "quickAction", "share"],
    correctIndex: 0,
    prize: 50000,
  },
  {
    id: 15,
    prompt: "¿Qué endpoint expone pagos en este repo?",
    answers: ["/api/initiate-payment", "/api/notify", "/api/profile", "/api/questions"],
    correctIndex: 0,
    prize: 100000,
  },
];
