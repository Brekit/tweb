/*
 * Message History Viewer Component
 * Shows the full history of message changes, edits, and deletions
 */

import {formatTime} from '../helpers/date';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import appMessageHistoryManager, {MessageHistoryEntry, MessageHistoryAction} from '../lib/appManagers/appMessageHistoryManager';
import {i18n, LangPackKey} from '../lib/langPack';
import PopupElement from './popups';
import Scrollable from './scrollable';
import getPeerTitle from './wrappers/getPeerTitle';
import {MyMessage} from '../lib/appManagers/appMessagesManager';
import Icon from './icon';

export interface MessageHistoryViewerOptions {
  peerId: PeerId;
  messageId: number;
  onClose?: () => void;
}

export default class MessageHistoryViewer extends PopupElement {
  private peerId: PeerId;
  private messageId: number;
  private historyContainer: HTMLElement;

  constructor(options: MessageHistoryViewerOptions) {
    super('popup-message-history', {
      closable: true,
      overlayClosable: true,
      body: true,
      withConfirm: false,
      title: true,
      scrollable: true
    });

    this.peerId = options.peerId;
    this.messageId = options.messageId;

    this.init();
    this.addEventListener('close', () => {
      options.onClose?.();
    });
  }

  private async init() {
    // Set popup title
    const peerTitle = await getPeerTitle({peerId: this.peerId, plainText: true});
    this.title.textContent = `Message History - ${peerTitle}`;

    // Create history container
    this.historyContainer = document.createElement('div');
    this.historyContainer.className = 'message-history-container';
    this.scrollable.container.append(this.historyContainer);

    this.loadHistory();
  }

  private async loadHistory() {
    const history = appMessageHistoryManager.getMessageHistory(this.peerId, this.messageId);
    const deletedMessage = appMessageHistoryManager.getDeletedMessage(this.peerId, this.messageId);

    if(history.length === 0 && !deletedMessage) {
      this.showEmptyState();
      return;
    }

    // Combine and sort all entries
    const allEntries = [...history];
    if(deletedMessage) {
      allEntries.push(deletedMessage);
    }
    allEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Clear container
    this.historyContainer.innerHTML = '';

    // Render each history entry
    allEntries.forEach((entry, index) => {
      const entryElement = this.createHistoryEntry(entry, index === 0);
      this.historyContainer.append(entryElement);
    });
  }

  private createHistoryEntry(entry: MessageHistoryEntry, isFirst: boolean): HTMLElement {
    const entryDiv = document.createElement('div');
    entryDiv.className = `message-history-entry ${entry.action}`;

    // Action icon and title
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-history-header';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'message-history-icon';
    const icon = this.getActionIcon(entry.action);
    iconDiv.append(icon);

    const titleDiv = document.createElement('div');
    titleDiv.className = 'message-history-title';
    titleDiv.textContent = this.getActionTitle(entry.action, isFirst);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-history-time';
    timeDiv.textContent = new Date(entry.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

    headerDiv.append(iconDiv, titleDiv, timeDiv);
    entryDiv.append(headerDiv);

    // Content based on action type
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-history-content';

    switch(entry.action) {
      case MessageHistoryAction.CREATED:
        contentDiv.append(this.renderMessageContent(entry.originalMessage));
        break;

      case MessageHistoryAction.EDITED:
        if(entry.changes) {
          contentDiv.append(this.renderChanges(entry.changes));
        }
        contentDiv.append(this.renderMessageContent(entry.editedMessage));
        break;

      case MessageHistoryAction.DELETED:
        contentDiv.append(this.renderDeletedContent(entry));
        break;

      case MessageHistoryAction.MEDIA_UPDATED:
        contentDiv.append(this.renderMediaUpdate(entry));
        break;
    }

    entryDiv.append(contentDiv);
    return entryDiv;
  }

  private getActionIcon(action: MessageHistoryAction): HTMLElement {
    let iconName: string;
    let className: string;

    switch(action) {
      case MessageHistoryAction.CREATED:
        iconName = 'add';
        className = 'created';
        break;
      case MessageHistoryAction.EDITED:
        iconName = 'edit';
        className = 'edited';
        break;
      case MessageHistoryAction.DELETED:
        iconName = 'delete';
        className = 'deleted';
        break;
      case MessageHistoryAction.MEDIA_UPDATED:
        iconName = 'image';
        className = 'media-updated';
        break;
      default:
        iconName = 'help';
        className = 'unknown';
    }

    const icon = Icon(iconName as any);
    icon.classList.add('message-history-action-icon', className);
    return icon;
  }

  private getActionTitle(action: MessageHistoryAction, isFirst: boolean): string {
    switch(action) {
      case MessageHistoryAction.CREATED:
        return isFirst ? 'Message Created' : 'Message Sent';
      case MessageHistoryAction.EDITED:
        return 'Message Edited';
      case MessageHistoryAction.DELETED:
        return 'Message Deleted';
      case MessageHistoryAction.MEDIA_UPDATED:
        return 'Media Updated';
      default:
        return 'Unknown Action';
    }
  }

  private renderMessageContent(message?: MyMessage): HTMLElement {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if(!message) {
      contentDiv.textContent = 'Message unavailable';
      return contentDiv;
    }

    if(message._ === 'message') {
      if(message.message) {
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';

        const wrappedText = wrapRichText(message.message, {
          entities: message.entities
        });
        textDiv.append(wrappedText);
        contentDiv.append(textDiv);
      }

      if(message.media) {
        const mediaDiv = document.createElement('div');
        mediaDiv.className = 'message-media';
        mediaDiv.append(this.renderMediaInfo(message.media));
        contentDiv.append(mediaDiv);
      }
    } else {
      // Service message
      const serviceDiv = document.createElement('div');
      serviceDiv.className = 'message-service';
      serviceDiv.textContent = 'Service message';
      contentDiv.append(serviceDiv);
    }

    return contentDiv;
  }

  private renderChanges(changes: MessageHistoryEntry['changes']): HTMLElement {
    const changesDiv = document.createElement('div');
    changesDiv.className = 'message-changes';

    if(changes?.text) {
      const textChangeDiv = document.createElement('div');
      textChangeDiv.className = 'text-change';

      const beforeDiv = document.createElement('div');
      beforeDiv.className = 'change-before';
      beforeDiv.textContent = `Before: ${changes.text.from}`;

      const afterDiv = document.createElement('div');
      afterDiv.className = 'change-after';
      afterDiv.textContent = `After: ${changes.text.to}`;

      textChangeDiv.append(beforeDiv, afterDiv);
      changesDiv.append(textChangeDiv);
    }

    if(changes?.media) {
      const mediaChangeDiv = document.createElement('div');
      mediaChangeDiv.className = 'media-change';
      mediaChangeDiv.textContent = 'Media was changed';
      changesDiv.append(mediaChangeDiv);
    }

    return changesDiv;
  }

  private renderDeletedContent(entry: MessageHistoryEntry): HTMLElement {
    const deletedDiv = document.createElement('div');
    deletedDiv.className = 'message-deleted';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'delete-info';

    if(entry.isRevoked) {
      infoDiv.textContent = 'Deleted for everyone';
    } else {
      infoDiv.textContent = 'Deleted for you';
    }

    deletedDiv.append(infoDiv);

    // Show original content if available
    if(entry.originalMessage) {
      const originalDiv = document.createElement('div');
      originalDiv.className = 'deleted-original';
      const headerDiv = document.createElement('div');
      headerDiv.textContent = 'Original content:';
      headerDiv.style.fontWeight = 'bold';
      originalDiv.append(headerDiv);
      originalDiv.append(this.renderMessageContent(entry.originalMessage));
      deletedDiv.append(originalDiv);
    }

    return deletedDiv;
  }

  private renderMediaUpdate(entry: MessageHistoryEntry): HTMLElement {
    const mediaDiv = document.createElement('div');
    mediaDiv.className = 'message-media-update';
    mediaDiv.textContent = 'Media was updated';

    if(entry.editedMessage?._ === 'message' && entry.editedMessage.media) {
      mediaDiv.append(this.renderMediaInfo(entry.editedMessage.media));
    }

    return mediaDiv;
  }

  private renderMediaInfo(media: any): HTMLElement {
    const mediaInfoDiv = document.createElement('div');
    mediaInfoDiv.className = 'media-info';

    switch(media._) {
      case 'messageMediaPhoto':
        const photoIcon = Icon('image');
        mediaInfoDiv.append(photoIcon, ' Photo');
        break;
      case 'messageMediaDocument':
        if(media.document) {
          const doc = media.document;
          const type = this.getDocumentTypeString(doc.mime_type);
          const docIcon = Icon('document');
          mediaInfoDiv.append(docIcon, ` ${type}`);
          if(doc.file_name) {
            const nameSpan = document.createElement('span');
            nameSpan.className = 'media-filename';
            nameSpan.textContent = doc.file_name;
            mediaInfoDiv.append(' - ', nameSpan);
          }
        }
        break;
      case 'messageMediaWebPage':
        const linkIcon = Icon('link');
        mediaInfoDiv.append(linkIcon, ' Web Page');
        break;
      default:
        const attachIcon = Icon('attach');
        mediaInfoDiv.append(attachIcon, ' Media');
    }

    return mediaInfoDiv;
  }

  private getDocumentTypeString(mimeType: string): string {
    if(mimeType.startsWith('image/')) return 'Image';
    if(mimeType.startsWith('video/')) return 'Video';
    if(mimeType.startsWith('audio/')) return 'Audio';
    if(mimeType === 'application/pdf') return 'PDF';
    return 'Document';
  }

  private showEmptyState() {
    this.historyContainer.innerHTML = '';

    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'message-history-empty';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'empty-icon';
    iconDiv.append(Icon('clock'));

    const textDiv = document.createElement('div');
    textDiv.className = 'empty-text';
    textDiv.textContent = 'No history available for this message';

    emptyDiv.append(iconDiv, textDiv);
    this.historyContainer.append(emptyDiv);
  }

  public static show(options: MessageHistoryViewerOptions) {
    return new MessageHistoryViewer(options).show();
  }
}
