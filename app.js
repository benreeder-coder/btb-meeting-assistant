/**
 * BTB AI Meeting Assistant
 * Chat Interface Application
 */

// ============================================
// Configuration
// ============================================
const CONFIG = {
    WEBHOOK_URL: 'https://breeder80.app.n8n.cloud/webhook/btb-ai-rag-chatbot-agent',
    STORAGE_KEY: 'btb-chats',
    ACTIVE_CHAT_KEY: 'btb-active-chat',
    MAX_TITLE_LENGTH: 50
};

// ============================================
// State Management
// ============================================
class ChatState {
    constructor() {
        this.chats = [];
        this.activeChat = null;
        this.isLoading = false;
        this.chatToDelete = null;
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
            this.chats = stored ? JSON.parse(stored) : [];

            const activeId = localStorage.getItem(CONFIG.ACTIVE_CHAT_KEY);
            if (activeId) {
                this.activeChat = this.chats.find(c => c.id === activeId) || null;
            }
        } catch (e) {
            console.error('Failed to load chats from storage:', e);
            this.chats = [];
            this.activeChat = null;
        }
    }

    saveToStorage() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.chats));
            if (this.activeChat) {
                localStorage.setItem(CONFIG.ACTIVE_CHAT_KEY, this.activeChat.id);
            } else {
                localStorage.removeItem(CONFIG.ACTIVE_CHAT_KEY);
            }
        } catch (e) {
            console.error('Failed to save chats to storage:', e);
        }
    }

    createChat() {
        const chat = {
            id: this.generateUUID(),
            sessionId: this.generateUUID(),
            title: 'New Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: []
        };
        this.chats.unshift(chat);
        this.activeChat = chat;
        this.saveToStorage();
        return chat;
    }

    updateChatTitle(chat, firstMessage) {
        const title = firstMessage.substring(0, CONFIG.MAX_TITLE_LENGTH);
        chat.title = title + (firstMessage.length > CONFIG.MAX_TITLE_LENGTH ? '...' : '');
        chat.updatedAt = new Date().toISOString();
        this.saveToStorage();
    }

    addMessage(role, content) {
        if (!this.activeChat) {
            this.createChat();
        }

        const message = {
            role,
            content,
            timestamp: new Date().toISOString()
        };

        this.activeChat.messages.push(message);
        this.activeChat.updatedAt = new Date().toISOString();

        // Update title with first user message
        if (role === 'user' && this.activeChat.messages.filter(m => m.role === 'user').length === 1) {
            this.updateChatTitle(this.activeChat, content);
        }

        this.saveToStorage();
        return message;
    }

    deleteChat(chatId) {
        const index = this.chats.findIndex(c => c.id === chatId);
        if (index !== -1) {
            this.chats.splice(index, 1);
            if (this.activeChat?.id === chatId) {
                this.activeChat = this.chats[0] || null;
            }
            this.saveToStorage();
        }
    }

    setActiveChat(chatId) {
        this.activeChat = this.chats.find(c => c.id === chatId) || null;
        this.saveToStorage();
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

// ============================================
// UI Controller
// ============================================
class UIController {
    constructor(state) {
        this.state = state;
        this.elements = {};
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.elements = {
            sidebar: document.getElementById('sidebar'),
            sidebarToggle: document.getElementById('sidebarToggle'),
            newChatBtn: document.getElementById('newChatBtn'),
            chatHistory: document.getElementById('chatHistory'),
            messagesContainer: document.getElementById('messagesContainer'),
            messages: document.getElementById('messages'),
            welcomeState: document.getElementById('welcomeState'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            deleteModal: document.getElementById('deleteModal'),
            cancelDelete: document.getElementById('cancelDelete'),
            confirmDelete: document.getElementById('confirmDelete')
        };

        // Create sidebar overlay for mobile - append to app-container for proper z-index stacking
        this.sidebarOverlay = document.createElement('div');
        this.sidebarOverlay.className = 'sidebar-overlay';
        const appContainer = document.querySelector('.app-container');
        appContainer.appendChild(this.sidebarOverlay);
    }

    bindEvents() {
        // Sidebar toggle
        this.elements.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        this.sidebarOverlay.addEventListener('click', () => this.closeSidebar());

        // New chat
        this.elements.newChatBtn.addEventListener('click', () => this.handleNewChat());

        // Message input
        this.elements.messageInput.addEventListener('input', () => this.handleInputChange());
        this.elements.messageInput.addEventListener('keydown', (e) => this.handleInputKeydown(e));

        // Send button
        this.elements.sendBtn.addEventListener('click', () => this.handleSendMessage());

        // Quick prompts
        document.querySelectorAll('.quick-prompt').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                this.elements.messageInput.value = prompt;
                this.handleInputChange();
                this.handleSendMessage();
            });
        });

        // Delete modal
        this.elements.cancelDelete.addEventListener('click', () => this.hideDeleteModal());
        this.elements.confirmDelete.addEventListener('click', () => this.handleConfirmDelete());
        this.elements.deleteModal.addEventListener('click', (e) => {
            if (e.target === this.elements.deleteModal) {
                this.hideDeleteModal();
            }
        });

        // Auto-resize textarea
        this.elements.messageInput.addEventListener('input', () => this.autoResizeTextarea());
    }

    toggleSidebar() {
        this.elements.sidebar.classList.toggle('open');
        this.sidebarOverlay.classList.toggle('active');
    }

    closeSidebar() {
        this.elements.sidebar.classList.remove('open');
        this.sidebarOverlay.classList.remove('active');
    }

    handleNewChat() {
        this.state.activeChat = null;
        this.render();
        this.elements.messageInput.focus();
        this.closeSidebar();
    }

    handleInputChange() {
        const hasValue = this.elements.messageInput.value.trim().length > 0;
        this.elements.sendBtn.disabled = !hasValue || this.state.isLoading;
    }

    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!this.elements.sendBtn.disabled) {
                this.handleSendMessage();
            }
        }
    }

    autoResizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }

    async handleSendMessage() {
        const content = this.elements.messageInput.value.trim();
        if (!content || this.state.isLoading) return;

        // Clear input
        this.elements.messageInput.value = '';
        this.elements.messageInput.style.height = 'auto';
        this.handleInputChange();

        // Hide welcome state immediately
        this.elements.welcomeState.style.display = 'none';

        // Create chat if needed
        if (!this.state.activeChat) {
            this.state.createChat();
        }

        // Add user message to state
        const userMessage = this.state.addMessage('user', content);

        // Immediately add user message to DOM (don't wait for full render)
        this.addMessageToDOM(userMessage);

        // Update sidebar
        this.renderChatHistory();
        this.scrollToBottom();

        // Show typing indicator
        this.state.isLoading = true;
        this.handleInputChange();
        this.showTypingIndicator();

        try {
            // Send to API
            const response = await this.sendToAPI(content);

            // Remove typing indicator and add response
            this.hideTypingIndicator();
            const assistantMessage = this.state.addMessage('assistant', response);
            this.addMessageToDOM(assistantMessage);
        } catch (error) {
            console.error('API Error:', error);
            this.hideTypingIndicator();
            const errorMessage = this.state.addMessage('assistant', 'Sorry, I encountered an error while processing your request. Please try again.');
            this.addMessageToDOM(errorMessage);
        }

        this.state.isLoading = false;
        this.handleInputChange();
        this.renderChatHistory(); // Only update sidebar, not messages
        this.scrollToBottom();
    }

    async sendToAPI(message) {
        const response = await fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatInput: message,
                sessionId: this.state.activeChat.sessionId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Debug logging - check browser console to see actual response structure
        console.log('API Response:', JSON.stringify(data, null, 2));

        // Extract the AI response from various n8n response formats
        return this.extractResponse(data);
    }

    extractResponse(data) {
        // If it's already a string, return it
        if (typeof data === 'string') {
            return data;
        }

        // If it's null or undefined
        if (data == null) {
            return 'No response received from the assistant.';
        }

        // If it's an array, get the first item and extract from it
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return 'No response received from the assistant.';
            }
            return this.extractResponse(data[0]);
        }

        // Check for common n8n AI Agent response properties
        // The AI Agent node typically returns { output: "..." }
        if (data.output !== undefined) {
            return typeof data.output === 'string' ? data.output : this.extractResponse(data.output);
        }

        // Check for nested json property (sometimes n8n wraps responses)
        if (data.json !== undefined) {
            return this.extractResponse(data.json);
        }

        // Check for text property
        if (data.text !== undefined) {
            return typeof data.text === 'string' ? data.text : this.extractResponse(data.text);
        }

        // Check for response property
        if (data.response !== undefined) {
            return typeof data.response === 'string' ? data.response : this.extractResponse(data.response);
        }

        // Check for message property
        if (data.message !== undefined) {
            return typeof data.message === 'string' ? data.message : this.extractResponse(data.message);
        }

        // Check for content property (OpenAI format)
        if (data.content !== undefined) {
            return typeof data.content === 'string' ? data.content : this.extractResponse(data.content);
        }

        // Check for result property
        if (data.result !== undefined) {
            return typeof data.result === 'string' ? data.result : this.extractResponse(data.result);
        }

        // Check for data property (nested wrapper)
        if (data.data !== undefined) {
            return this.extractResponse(data.data);
        }

        // Check for body property
        if (data.body !== undefined) {
            return this.extractResponse(data.body);
        }

        // If it's an object with unknown structure, try to find any string value
        const keys = Object.keys(data);
        for (const key of keys) {
            if (typeof data[key] === 'string' && data[key].length > 10) {
                console.log(`Found response in key: ${key}`);
                return data[key];
            }
        }

        // Last resort: stringify the object
        console.warn('Could not extract response, returning stringified data:', data);
        return JSON.stringify(data, null, 2);
    }

    addMessageToDOM(msg) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${msg.role}`;

        if (msg.role === 'user') {
            messageEl.innerHTML = `
                <div class="message-avatar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>
                <div class="message-content">
                    <div class="message-text">${this.escapeHtml(msg.content)}</div>
                    <div class="message-time">${this.formatMessageTime(msg.timestamp)}</div>
                </div>
            `;
        } else {
            messageEl.innerHTML = `
                <div class="message-avatar">
                    <img src="Untitled design (16).png" alt="BTB AI">
                </div>
                <div class="message-content">
                    <div class="message-text">${this.parseMarkdown(msg.content)}</div>
                    <div class="message-time">${this.formatMessageTime(msg.timestamp)}</div>
                </div>
            `;
        }

        // Insert before typing indicator if it exists, otherwise append
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            this.elements.messages.insertBefore(messageEl, typingIndicator);
        } else {
            this.elements.messages.appendChild(messageEl);
        }
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typingIndicator';
        indicator.innerHTML = `
            <div class="message-avatar">
                <img src="Untitled design (16).png" alt="BTB AI">
            </div>
            <div class="message-content">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        this.elements.messages.appendChild(indicator);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 100);
    }

    showDeleteModal(chatId) {
        this.state.chatToDelete = chatId;
        this.elements.deleteModal.classList.add('active');
    }

    hideDeleteModal() {
        this.state.chatToDelete = null;
        this.elements.deleteModal.classList.remove('active');
    }

    handleConfirmDelete() {
        if (this.state.chatToDelete) {
            this.state.deleteChat(this.state.chatToDelete);
            this.hideDeleteModal();
            this.render();
        }
    }

    formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return date.toLocaleDateString('en-US', { weekday: 'long' });
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    }

    formatMessageTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    parseMarkdown(text) {
        // Simple markdown parsing
        let html = text
            // Escape HTML
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Code blocks
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Inline code
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // Line breaks
            .replace(/\n/g, '<br>')
            // Lists (basic)
            .replace(/^- (.*?)(<br>|$)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>');

        return html;
    }

    renderChatHistory() {
        if (this.state.chats.length === 0) {
            this.elements.chatHistory.innerHTML = `
                <div class="chat-history-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <div>No chats yet</div>
                </div>
            `;
            return;
        }

        this.elements.chatHistory.innerHTML = this.state.chats.map(chat => `
            <div class="chat-history-item ${this.state.activeChat?.id === chat.id ? 'active' : ''}" data-id="${chat.id}">
                <div class="chat-title">${this.escapeHtml(chat.title)}</div>
                <div class="chat-date">${this.formatTime(chat.updatedAt)}</div>
                <button class="delete-btn" data-delete="${chat.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `).join('');

        // Bind click events
        this.elements.chatHistory.querySelectorAll('.chat-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn')) {
                    this.state.setActiveChat(item.dataset.id);
                    this.render();
                    this.closeSidebar();
                }
            });
        });

        this.elements.chatHistory.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDeleteModal(btn.dataset.delete);
            });
        });
    }

    renderMessages() {
        if (!this.state.activeChat || this.state.activeChat.messages.length === 0) {
            this.elements.welcomeState.style.display = 'flex';
            // Clear any existing messages except welcome state
            const existingMessages = this.elements.messages.querySelectorAll('.message');
            existingMessages.forEach(msg => msg.remove());
            return;
        }

        this.elements.welcomeState.style.display = 'none';

        // Clear existing messages (except typing indicator)
        const existingMessages = this.elements.messages.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        // Render each message
        this.state.activeChat.messages.forEach(msg => {
            const messageEl = document.createElement('div');
            messageEl.className = `message ${msg.role}`;

            if (msg.role === 'user') {
                messageEl.innerHTML = `
                    <div class="message-avatar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <div class="message-content">
                        <div class="message-text">${this.escapeHtml(msg.content)}</div>
                        <div class="message-time">${this.formatMessageTime(msg.timestamp)}</div>
                    </div>
                `;
            } else {
                messageEl.innerHTML = `
                    <div class="message-avatar">
                        <img src="Untitled design (16).png" alt="BTB AI">
                    </div>
                    <div class="message-content">
                        <div class="message-text">${this.parseMarkdown(msg.content)}</div>
                        <div class="message-time">${this.formatMessageTime(msg.timestamp)}</div>
                    </div>
                `;
            }

            // Insert before typing indicator if it exists, otherwise append
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                this.elements.messages.insertBefore(messageEl, typingIndicator);
            } else {
                this.elements.messages.appendChild(messageEl);
            }
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    render() {
        this.renderChatHistory();
        this.renderMessages();
    }
}

// ============================================
// Application Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const state = new ChatState();
    state.loadFromStorage();

    const ui = new UIController(state);
    ui.render();

    // Focus input on load
    ui.elements.messageInput.focus();

    // Handle visibility change (re-focus when tab becomes visible)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            ui.elements.messageInput.focus();
        }
    });

    // Keyboard shortcut: Escape to close sidebar on mobile
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            ui.closeSidebar();
            ui.hideDeleteModal();
        }
    });

    console.log('BTB AI Meeting Assistant initialized');
});
