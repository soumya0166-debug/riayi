'use client';

import React from 'react';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatNavbar } from '@/components/chat/ChatNavbar';
import { MessageList } from '@/components/chat/MessageList';
import { Composer } from '@/components/chat/Composer';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { AutomationModal } from '@/components/automation/AutomationModal';
import { Info } from 'lucide-react';

export default function ChatPage() {
  return (
    <div className="chat-layout">
      {/* Collapsible / Mobile Drawer Sidebar */}
      <Sidebar />

      {/* Primary Workspace Area */}
      <main className="chat-main">
        <ChatNavbar />

        {/* Dynamic Message Scroll Area & Welcome State */}
        <MessageList />

        {/* Bottom Input Composer */}
        <Composer />
      </main>

      {/* Global Settings & Automation Modals */}
      <SettingsModal />
      <AutomationModal />
    </div>
  );
}
