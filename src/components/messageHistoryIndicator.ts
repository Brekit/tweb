/*
 * Message History Indicator Component
 * Shows an indicator next to messages that have been edited or deleted
 * Clicking the indicator opens the message history viewer
 */

import {attachClickEvent} from '../helpers/dom/clickEvent';
import appMessageHistoryManager from '../lib/appManagers/appMessageHistoryManager';
import {MyMessage} from '../lib/appManagers/appMessagesManager';
import MessageHistoryViewer from './messageHistoryViewer';
import Icon from './icon';
import {i18n} from '../lib/langPack';
import ripple from './ripple';

export interface MessageHistoryIndicatorOptions {
  message: MyMessage;
  container: HTMLElement;
}

export default class MessageHistoryIndicator {
  private message: MyMessage;
  private container: HTMLElement;
  private indicatorElement: HTMLElement;

  constructor(options: MessageHistoryIndicatorOptions) {
    this.message = options.message;
    this.container = options.container;
    
    this.init();
  }

  private init() {
    // Check if message has history
    const hasHistory = appMessageHistoryManager.hasMessageHistory(this.message.peerId, this.message.mid);
    const isDeleted = appMessageHistoryManager.getDeletedMessage(this.message.peerId, this.message.mid);
    
    if (!hasHistory && !isDeleted) {
      return;
    }

    this.createIndicator();
  }

  private createIndicator() {
    this.indicatorElement = document.createElement('button');
    this.indicatorElement.className = 'message-history-indicator';
    this.indicatorElement.setAttribute('title', 'View message history');
    
    // Add appropriate icon based on message status
    const history = appMessageHistoryManager.getMessageHistory(this.message.peerId, this.message.mid);
    const deletedMessage = appMessageHistoryManager.getDeletedMessage(this.message.peerId, this.message.mid);
    
    let iconName: string;
    let className: string;
    let tooltip: string;

    if (deletedMessage) {
      iconName = 'delete';
      className = 'deleted';
      tooltip = 'Message was deleted - click to view history';
    } else if (history.some(entry => entry.action === 'edited')) {
      iconName = 'edit';
      className = 'edited';
      tooltip = 'Message was edited - click to view history';
    } else {
      iconName = 'clock';
      className = 'has-history';
      tooltip = 'Message has history - click to view';
    }

    this.indicatorElement.classList.add(className);
    this.indicatorElement.setAttribute('title', tooltip);
    
    const icon = Icon(iconName as any);
    this.indicatorElement.append(icon);
    
    // Add ripple effect
    ripple(this.indicatorElement);

    // Add click handler
    attachClickEvent(this.indicatorElement, (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.showHistory();
    });

    // Insert the indicator into the message container
    this.insertIndicator();
  }

  private insertIndicator() {
    // Try to find the message content area to insert the indicator
    const messageContent = this.container.querySelector('.message-content');
    const bubbleContent = this.container.querySelector('.bubble-content');
    const targetContainer = messageContent || bubbleContent || this.container;

    if (targetContainer) {
      // Create wrapper if needed
      let indicatorWrapper = this.container.querySelector('.message-history-wrapper');
      if (!indicatorWrapper) {
        indicatorWrapper = document.createElement('div');
        indicatorWrapper.className = 'message-history-wrapper';
        targetContainer.append(indicatorWrapper);
      }

      indicatorWrapper.append(this.indicatorElement);
    }
  }

  private showHistory() {
    MessageHistoryViewer.show({
      peerId: this.message.peerId,
      messageId: this.message.mid,
      onClose: () => {
        // Could refresh indicator if needed
      }
    });
  }

  public refresh() {
    // Remove existing indicator
    if (this.indicatorElement) {
      this.indicatorElement.remove();
    }

    // Recreate if still needed
    this.init();
  }

  public destroy() {
    if (this.indicatorElement) {
      this.indicatorElement.remove();
    }
  }

  // Static method to add indicators to messages
  public static addToMessage(options: MessageHistoryIndicatorOptions): MessageHistoryIndicator | null {
    const hasHistory = appMessageHistoryManager.hasMessageHistory(options.message.peerId, options.message.mid);
    const isDeleted = appMessageHistoryManager.getDeletedMessage(options.message.peerId, options.message.mid);
    
    if (!hasHistory && !isDeleted) {
      return null;
    }

    return new MessageHistoryIndicator(options);
  }

  // Static method to add indicators to multiple messages
  public static addToMessages(messages: Array<{message: MyMessage, container: HTMLElement}>): MessageHistoryIndicator[] {
    const indicators: MessageHistoryIndicator[] = [];
    
    messages.forEach(({message, container}) => {
      const indicator = MessageHistoryIndicator.addToMessage({message, container});
      if (indicator) {
        indicators.push(indicator);
      }
    });

    return indicators;
  }

  // Static method to refresh all indicators in a container
  public static refreshIndicators(containerElement: HTMLElement) {
    const indicators = containerElement.querySelectorAll('.message-history-indicator');
    indicators.forEach(indicator => indicator.remove());
    
    // Note: This would need to be called when messages are re-rendered
    // The actual implementation would depend on how the message rendering works
  }
}