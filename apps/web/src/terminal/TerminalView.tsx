import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface TerminalViewProps {
  sessionId: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#ffffff",
        foreground: "#18181b",
        cursor: "#71717a",
        selectionBackground: "#e4e4e7",
      },
      fontFamily: "monospace",
      fontSize: 13,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/pty/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full bg-white border border-zinc-200 rounded-lg overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 border-b border-zinc-200 text-xs text-zinc-600 font-mono">
        <span>Terminal (PTY)</span>
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
      </div>
      <div ref={containerRef} className="flex-1 p-2 bg-white" />
    </div>
  );
};
