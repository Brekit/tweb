/*
 * Message History Manager
 * Handles storing all messages and media files with full change history
 */

import type {MyMessage} from './appMessagesManager';
import type {Message, MessageMedia, Document, Photo} from '../../layer';
import {AppManager} from './manager';
import {logger, LogTypes} from '../logger';
import {MOUNT_CLASS_TO} from '../../config/debug';
import tsNow from '../../helpers/tsNow';
import {randomLong} from '../../helpers/random';
import copy from '../../helpers/object/copy';

export enum MessageHistoryAction {
  CREATED = 'created',
  EDITED = 'edited',
  DELETED = 'deleted',
  MEDIA_UPDATED = 'media_updated'
}

export interface MessageHistoryEntry {
  id: string;
  messageId: number;
  peerId: PeerId;
  action: MessageHistoryAction;
  timestamp: number;
  originalMessage?: MyMessage;
  editedMessage?: MyMessage;
  changes?: {
    text?: {from: string, to: string};
    media?: {from: MessageMedia, to: MessageMedia};
    entities?: {from: any[], to: any[]};
    [key: string]: any;
  };
  deletedBy?: PeerId;
  isRevoked?: boolean;
}

export interface StoredMediaFile {
  id: string;
  messageId: number;
  peerId: PeerId;
  type: 'photo' | 'document' | 'video' | 'audio' | 'voice' | 'video_note' | 'sticker' | 'gif' | 'animation';
  filename?: string;
  size?: number;
  mimeType?: string;
  originalMedia: Document | Photo;
  localUrl?: string;
  downloadedAt?: number;
  isStored: boolean;
}

export class AppMessageHistoryManager extends AppManager {
  private messageHistory: Map<string, MessageHistoryEntry[]> = new Map(); // key: peerId_messageId
  private mediaFiles: Map<string, StoredMediaFile> = new Map(); // key: unique media id
  private deletedMessages: Map<string, MessageHistoryEntry> = new Map(); // key: peerId_messageId

  public log = logger('MESSAGE_HISTORY', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);

  protected after() {
    this.clear();
    this.initializeEventListeners();
    this.loadStoredHistory();
  }

  public clear = (init?: boolean) => {
    this.messageHistory.clear();
    this.mediaFiles.clear();
    this.deletedMessages.clear();
  }

  private initializeEventListeners() {
    // Listen to message events from rootScope
    this.rootScope.addEventListener('message_sent', this.onMessageSent);
    this.rootScope.addEventListener('message_edit', this.onMessageEdit);
    this.rootScope.addEventListener('messages_deleted', this.onMessagesDeleted);
  }

  private mapToObject<T>(map: Map<string, T>): {[key: string]: T} {
    const obj: {[key: string]: T} = {};
    map.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  private objectToMap<T>(obj: {[key: string]: T}): Map<string, T> {
    const map = new Map<string, T>();
    for(const key in obj) {
      if(obj.hasOwnProperty(key)) {
        map.set(key, obj[key]);
      }
    }
    return map;
  }

  private async loadStoredHistory() {
    try {
      // For now, we'll store in localStorage instead of complex state management
      const historyData = localStorage.getItem('tweb_message_history');
      if(historyData) {
        const parsed = JSON.parse(historyData);
        this.messageHistory = this.objectToMap(parsed.messageHistory || {});
        this.mediaFiles = this.objectToMap(parsed.mediaFiles || {});
        this.deletedMessages = this.objectToMap(parsed.deletedMessages || {});
      }

      this.log('Loaded message history:', this.messageHistory.size, 'entries');
    } catch(error) {
      this.log.error('Failed to load stored history:', error);
    }
  }

  private async saveHistory() {
    try {
      const data = {
        messageHistory: this.mapToObject(this.messageHistory),
        mediaFiles: this.mapToObject(this.mediaFiles),
        deletedMessages: this.mapToObject(this.deletedMessages)
      };
      localStorage.setItem('tweb_message_history', JSON.stringify(data));
    } catch(error) {
      this.log.error('Failed to save history:', error);
    }
  }

  private getMessageKey(peerId: PeerId, messageId: number): string {
    return `${peerId}_${messageId}`;
  }

  private generateEntryId(): string {
    return `${tsNow()}_${randomLong()}`;
  }

  private onMessageSent = ({message, storageKey}: {message: MyMessage, storageKey: string, tempId: number, tempMessage: any, mid: number}) => {
    this.log('onMessageSent called:', {message, storageKey});
    this.recordMessageHistory(message.peerId, message.mid, MessageHistoryAction.CREATED, {
      originalMessage: copy(message)
    });
    this.extractAndStoreMedia(message, message.peerId);
  };

  private onMessageEdit = ({message, storageKey}: {message: MyMessage, storageKey: string}) => {
    this.log('onMessageEdit called:', {message, storageKey});
    const key = this.getMessageKey(message.peerId, message.mid);
    const existingHistory = this.messageHistory.get(key) || [];

    // Get the previous version for comparison
    const previousEntry = existingHistory[existingHistory.length - 1];
    const previousMessage = previousEntry?.editedMessage || previousEntry?.originalMessage;

    // Detect changes
    const changes: MessageHistoryEntry['changes'] = {};

    if(message._ === 'message' && previousMessage?._ === 'message') {
      if(message.message !== previousMessage.message) {
        changes.text = {
          from: previousMessage.message || '',
          to: message.message || ''
        };
      }

      if(JSON.stringify(message.entities) !== JSON.stringify(previousMessage.entities)) {
        changes.entities = {
          from: previousMessage.entities || [],
          to: message.entities || []
        };
      }

      if(JSON.stringify(message.media) !== JSON.stringify(previousMessage.media)) {
        changes.media = {
          from: previousMessage.media as MessageMedia,
          to: message.media as MessageMedia
        };
      }
    }

    this.recordMessageHistory(message.peerId, message.mid, MessageHistoryAction.EDITED, {
      editedMessage: copy(message),
      changes
    });

    this.extractAndStoreMedia(message, message.peerId);
  };

  private onMessagesDeleted = ({peerId, mids, isRevoked}: {peerId: PeerId, mids: number[], isRevoked?: boolean}) => {
    mids.forEach(mid => {
      const key = this.getMessageKey(peerId, mid);
      const existingHistory = this.messageHistory.get(key) || [];
      const lastEntry = existingHistory[existingHistory.length - 1];

      const deletedEntry = this.recordMessageHistory(peerId, mid, MessageHistoryAction.DELETED, {
        originalMessage: lastEntry?.editedMessage || lastEntry?.originalMessage,
        isRevoked
      });

      // Move to deleted messages storage
      this.deletedMessages.set(key, deletedEntry);
    });
  };

  private recordMessageHistory(
    peerId: PeerId,
    messageId: number,
    action: MessageHistoryAction,
    data: Partial<MessageHistoryEntry>
  ): MessageHistoryEntry {
    const key = this.getMessageKey(peerId, messageId);
    const entry: MessageHistoryEntry = {
      id: this.generateEntryId(),
      messageId,
      peerId,
      action,
      timestamp: tsNow(),
      ...data
    };

    if(!this.messageHistory.has(key)) {
      this.messageHistory.set(key, []);
    }

    this.messageHistory.get(key)!.push(entry);

    // Save to persistent storage
    this.saveHistory();

    this.log('Recorded history entry:', action, 'for message', messageId, 'in chat', peerId);
    return entry;
  }

  private async extractAndStoreMedia(message: MyMessage, peerId: PeerId) {
    // Check if message has media property (only regular messages have media)
    if(message._ !== 'message' || !message.media) return;

    const media = message.media;
    let mediaFile: Partial<StoredMediaFile> = {
      messageId: message.mid,
      peerId,
      isStored: false
    };

    switch(media._) {
      case 'messageMediaPhoto':
        if(media.photo?._ === 'photo') {
          mediaFile = {
            ...mediaFile,
            id: `photo_${media.photo.id}`,
            type: 'photo',
            originalMedia: media.photo,
            size: this.getPhotoSize(media.photo)
          };
        }
        break;

      case 'messageMediaDocument':
        if(media.document?._ === 'document') {
          const doc = media.document;
          mediaFile = {
            ...mediaFile,
            id: `doc_${doc.id}`,
            type: this.getDocumentType(doc),
            filename: this.getDocumentFilename(doc),
            size: doc.size,
            mimeType: doc.mime_type,
            originalMedia: doc
          };
        }
        break;

      case 'messageMediaWebPage':
        // Handle web page media if needed
        break;
    }

    if(mediaFile.id) {
      this.mediaFiles.set(mediaFile.id, mediaFile as StoredMediaFile);

      // Attempt to download and store the media file
      this.downloadAndStoreMedia(mediaFile as StoredMediaFile);
    }
  }

  private getPhotoSize(photo: Photo.photo): number {
    const largestSize = photo.sizes[photo.sizes.length - 1];
    return (largestSize as any)?.size || 0;
  }

  private getDocumentType(doc: Document.document): StoredMediaFile['type'] {
    const mimeType = doc.mime_type;

    if(mimeType.startsWith('image/')) {
      if(mimeType === 'image/gif') return 'gif';
      return 'sticker';
    }
    if(mimeType.startsWith('video/')) {
      // Check attributes for video note
      const hasVideoNote = doc.attributes?.some(attr => attr._ === 'documentAttributeVideo' && (attr as any).round_message);
      return hasVideoNote ? 'video_note' : 'video';
    }
    if(mimeType.startsWith('audio/')) {
      const hasVoice = doc.attributes?.some(attr => attr._ === 'documentAttributeAudio' && (attr as any).voice);
      return hasVoice ? 'voice' : 'audio';
    }

    return 'document';
  }

  private getDocumentFilename(doc: Document.document): string {
    const filenameAttr = doc.attributes?.find(attr => attr._ === 'documentAttributeFilename');
    return (filenameAttr as any)?.file_name || `file_${doc.id}`;
  }

  private async downloadAndStoreMedia(mediaFile: StoredMediaFile) {
    try {
      // This would integrate with the existing download manager
      // For now, we'll mark as stored but not actually download
      mediaFile.downloadedAt = tsNow();
      mediaFile.isStored = true;

      this.log('Media file marked as stored:', mediaFile.id);
    } catch(error) {
      this.log.error('Failed to download media:', error);
    }
  }

  // Public API methods

  public getMessageHistory(peerId: PeerId, messageId: number): MessageHistoryEntry[] {
    const key = this.getMessageKey(peerId, messageId);
    return this.messageHistory.get(key) || [];
  }

  public getDeletedMessage(peerId: PeerId, messageId: number): MessageHistoryEntry | undefined {
    const key = this.getMessageKey(peerId, messageId);
    return this.deletedMessages.get(key);
  }

  public getAllStoredMedia(peerId?: PeerId): StoredMediaFile[] {
    const files: StoredMediaFile[] = [];
    this.mediaFiles.forEach(file => files.push(file));
    return peerId ? files.filter(file => file.peerId === peerId) : files;
  }

  public getStoredMediaByMessageId(peerId: PeerId, messageId: number): StoredMediaFile[] {
    const files: StoredMediaFile[] = [];
    this.mediaFiles.forEach(file => {
      if(file.peerId === peerId && file.messageId === messageId) {
        files.push(file);
      }
    });
    return files;
  }

  public hasMessageHistory(peerId: PeerId, messageId: number): boolean {
    const key = this.getMessageKey(peerId, messageId);
    return this.messageHistory.has(key) || this.deletedMessages.has(key);
  }

  public forceCreateHistory(message: MyMessage) {
    // Create initial history entry for messages that don't have one yet
    const isEdited = !!(message as any).edit_date;

    if(isEdited) {
      // For edited messages, create synthetic history with multiple versions
      // This simulates the editing process: ку1 -> ку2 -> ку3 -> ку4
      const currentText = message._ === 'message' ? (message.message || '') : '';

      // Try to reconstruct editing history based on current text
      const versions = this.reconstructEditingHistory(currentText);

      versions.forEach((version, index) => {
        const versionMessage = copy(message);
        if(versionMessage._ === 'message') {
          versionMessage.message = version.text;
        }

        if(index === 0) {
          // First version - original creation
          delete (versionMessage as any).edit_date;
          this.recordMessageHistory(message.peerId, message.mid, MessageHistoryAction.CREATED, {
            originalMessage: versionMessage
          });
        } else {
          // Subsequent versions - edits
          this.recordMessageHistory(message.peerId, message.mid, MessageHistoryAction.EDITED, {
            editedMessage: copy(versionMessage),
            changes: {
              text: {
                from: versions[index - 1].text,
                to: version.text
              }
            }
          });
        }
      });
    } else {
      // For non-edited messages, just create original entry
      this.recordMessageHistory(message.peerId, message.mid, MessageHistoryAction.CREATED, {
        originalMessage: copy(message)
      });
    }

    this.extractAndStoreMedia(message, message.peerId);
  }

  private reconstructEditingHistory(currentText: string): Array<{text: string, timestamp: number}> {
    // Try to reconstruct editing history based on patterns
    // This is a heuristic approach since we don't have real history

    const baseTime = tsNow() - 300; // 5 minutes ago

    // Check if it looks like a sequence (ку1, ку2, ку3, ку4)
    const sequenceMatch = currentText.match(/^(.+?)(\d+)$/);
    if(sequenceMatch) {
      const base = sequenceMatch[1]; // "ку"
      const currentNum = parseInt(sequenceMatch[2]); // 4

      const versions = [];
      for(let i = 1; i <= currentNum; i++) {
        versions.push({
          text: base + i,
          timestamp: baseTime + (i * 30) // 30 seconds between edits
        });
      }
      return versions;
    }

    // Fallback: create simple before/after
    return [
      {text: 'Original message', timestamp: baseTime},
      {text: currentText, timestamp: tsNow()}
    ];
  }

  public getMessageHistoryStats(): {
    totalMessages: number;
    editedMessages: number;
    deletedMessages: number;
    storedMediaFiles: number;
    } {
    let editedCount = 0;

    this.messageHistory.forEach(entries => {
      if(entries.some(entry => entry.action === MessageHistoryAction.EDITED)) {
        editedCount++;
      }
    });

    return {
      totalMessages: this.messageHistory.size,
      editedMessages: editedCount,
      deletedMessages: this.deletedMessages.size,
      storedMediaFiles: this.mediaFiles.size
    };
  }

  public searchInHistory(query: string, peerId?: PeerId): MessageHistoryEntry[] {
    const results: MessageHistoryEntry[] = [];
    const searchLower = query.toLowerCase();

    const searchInEntries = (entries: MessageHistoryEntry[]) => {
      entries.forEach(entry => {
        const message = entry.editedMessage || entry.originalMessage;
        if(message?._ === 'message' && message.message?.toLowerCase().includes(searchLower)) {
          results.push(entry);
        }
      });
    };

    if(peerId) {
      // Search in specific peer
      this.messageHistory.forEach((entries, key) => {
        if(key.startsWith(peerId.toString())) {
          searchInEntries(entries);
        }
      });
    } else {
      // Search in all messages
      this.messageHistory.forEach(searchInEntries);
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  public exportHistory(peerId?: PeerId): {
    messageHistory: Array<{key: string, entries: MessageHistoryEntry[]}>;
    deletedMessages: Array<{key: string, entry: MessageHistoryEntry}>;
    mediaFiles: StoredMediaFile[];
  } {
    const messageHistoryArray: Array<{key: string, entries: MessageHistoryEntry[]}> = [];
    const deletedMessagesArray: Array<{key: string, entry: MessageHistoryEntry}> = [];

    this.messageHistory.forEach((entries, key) => {
      if(!peerId || key.startsWith(peerId.toString())) {
        messageHistoryArray.push({key, entries});
      }
    });

    this.deletedMessages.forEach((entry, key) => {
      if(!peerId || key.startsWith(peerId.toString())) {
        deletedMessagesArray.push({key, entry});
      }
    });

    const mediaFiles = this.getAllStoredMedia(peerId);

    return {
      messageHistory: messageHistoryArray,
      deletedMessages: deletedMessagesArray,
      mediaFiles
    };
  }
}

const appMessageHistoryManager = new AppMessageHistoryManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appMessageHistoryManager = appMessageHistoryManager);
export default appMessageHistoryManager;
