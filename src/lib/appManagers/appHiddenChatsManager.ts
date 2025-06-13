/*
 * Hidden Chats Manager
 * Handles hiding specific chats from dialogs and disabling their notifications
 */

import {AppManager} from './manager';
import {logger, LogTypes} from '../logger';
import {MOUNT_CLASS_TO} from '../../config/debug';
import {SERVICE_PEER_ID} from '../mtproto/mtproto_config';

export class AppHiddenChatsManager extends AppManager {
  private hiddenPeerIds: Set<PeerId> = new Set();

  public log = logger('HIDDEN_CHATS', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);

  protected after() {
    this.clear();
    this.initializeHiddenChats();
  }

  public clear = (init?: boolean) => {
    this.hiddenPeerIds.clear();
  }

  private initializeHiddenChats() {
    // Hide Telegram's official chat (777000)
    this.hiddenPeerIds.add(SERVICE_PEER_ID);

    this.log('Initialized hidden chats:', Array.from(this.hiddenPeerIds));
  }

  public isHidden(peerId: PeerId): boolean {
    return this.hiddenPeerIds.has(peerId);
  }

  public hideChat(peerId: PeerId): void {
    this.hiddenPeerIds.add(peerId);
    this.log('Chat hidden:', peerId);
  }

  public unhideChat(peerId: PeerId): void {
    this.hiddenPeerIds.delete(peerId);
    this.log('Chat unhidden:', peerId);
  }

  public getHiddenChats(): PeerId[] {
    return Array.from(this.hiddenPeerIds);
  }

  public shouldHideFromDialogs(peerId: PeerId): boolean {
    return this.isHidden(peerId);
  }

  public shouldBlockNotifications(peerId: PeerId): boolean {
    return this.isHidden(peerId);
  }
}

const appHiddenChatsManager = new AppHiddenChatsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appHiddenChatsManager = appHiddenChatsManager);
export default appHiddenChatsManager;
