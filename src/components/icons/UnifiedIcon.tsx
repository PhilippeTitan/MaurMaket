import React from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight,
  AtSign, BadgeAlert, BadgeCheck, Bell, BellOff, BellRing, BookOpenText, Brush,
  Building2, CalendarClock, CalendarDays, Camera, Check, CheckCheck, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Circle, CircleAlert, CircleCheck,
  CircleDollarSign, CircleHelp, CircleMinus, CirclePlus, CircleUserRound, CircleX,
  ClipboardList, Clock, CloudAlert, CloudOff, Copy, CreditCard, Ellipsis, ExternalLink,
  Eye, FileSearch, FileText, Fingerprint, Flame, Flag, Grid2X2, Heart, Image,
  ImageOff, Images, Info, KeyRound, Languages, Lightbulb, Link, List, LoaderCircle,
  LockKeyhole, LogOut, Mail, MailCheck, Map, MapPin, MapPinCheck, MapPinPlus,
  MapPinned, Maximize, MessageCircle, MessageSquare, Mic, Minus, Moon, MoreHorizontal,
  MoreVertical, Navigation, Package, PackageCheck, PauseCircle, Pencil, Phone,
  Pin, PinOff, Play, Plus, QrCode, Receipt, ReceiptText, RefreshCw, Reply,
  RotateCcw, Search, Send, Settings, Share2, ShieldAlert, ShieldCheck, ShieldQuestion,
  ShoppingBag, ShoppingCart, Shapes, Smartphone, SlidersHorizontal, Sparkles, Star,
  Store, Sun, SunMoon, Tag, ThumbsDown, ThumbsUp, Timer, Trash2, Truck, UserRound,
  UserRoundPlus, UserRoundX, UsersRound, Wallet, WifiOff, X, Zap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/theme';

/** Material Community names retained as a compatibility API while screens migrate. */
const ICONS: Record<string, LucideIcon> = {
  account: UserRound, 'account-outline': UserRound, 'account-badge-outline': BadgeCheck,
  'account-cancel-outline': UserRoundX, 'account-group-outline': UsersRound,
  'alert-circle': CircleAlert, 'alert-circle-outline': CircleAlert, 'alert-decagram-outline': BadgeAlert,
  apps: Grid2X2, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'arrow-top-right': ArrowUpRight,
  'arrow-up': ArrowUp, at: AtSign, 'bell-cancel-outline': BellOff, 'bell-off-outline': BellOff,
  'bell-outline': Bell, 'bell-ring-outline': BellRing, 'block-helper': ShieldAlert, broom: Brush,
  'bug-outline': Activity, 'bullhorn-outline': BellRing, 'calendar-clock': CalendarClock,
  'calendar-clock-outline': CalendarClock, 'calendar-month-outline': CalendarDays,
  'calendar-outline': CalendarDays, camera: Camera, 'camera-off-outline': Camera,
  'camera-outline': Camera, 'camera-plus-outline': Camera, cancel: CircleX,
  cart: ShoppingCart, 'cart-plus': ShoppingCart, 'cash-multiple': Wallet, cellphone: Smartphone,
  'cellphone-key': KeyRound, 'chart-box-outline': Activity, 'chart-line': Activity,
  check: Check, 'check-circle': CircleCheck, 'check-circle-outline': CircleCheck,
  'check-decagram': BadgeCheck, 'check-decagram-outline': BadgeCheck,
  'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'chevron-up': ChevronUp, 'city-variant-outline': Building2, 'clipboard-text-outline': ClipboardList,
  'clock-alert-outline': Clock, 'clock-check': Clock, 'clock-outline': Clock, 'clock-plus': Clock,
  'cloud-alert-outline': CloudAlert, 'cloud-off-outline': CloudOff, 'cog-outline': Settings,
  'comment-outline': MessageCircle, 'content-copy': Copy, 'content-paste': ClipboardList,
  counter: CircleHelp, 'crosshairs-gps': Navigation, 'delete-outline': Trash2,
  delivery: Truck, 'dice-5-outline': Shapes, 'dots-horizontal': MoreHorizontal,
  'dots-vertical': MoreVertical, edit: Pencil, 'email-check-outline': MailCheck,
  'email-fast-outline': Send, 'email-outline': Mail, 'eye-outline': Eye,
  'file-document-outline': FileText, 'file-edit-outline': Pencil, 'file-search-outline': FileSearch,
  fingerprint: Fingerprint, fire: Flame, 'flag-outline': Flag, 'form-textbox-password': KeyRound,
  'format-list-bulleted-square': List, fullscreen: Maximize, google: Circle,
  heart: Heart, 'image-multiple-outline': Images, 'image-off-outline': ImageOff,
  'image-outline': Image, 'information-outline': Info, 'key-outline': KeyRound,
  'layers-outline': Grid2X2, 'lightbulb-on-outline': Lightbulb, 'lightbulb-outline': Lightbulb,
  'lightning-bolt': Zap, 'link-variant': Link, loading: LoaderCircle, 'location-pin': MapPin,
  'lock-check': LockKeyhole, 'lock-outline': LockKeyhole, locked: LockKeyhole,
  logout: LogOut, magnify: Search, map: Map, 'map-marker': MapPin, 'map-marker-check': MapPinCheck,
  'map-marker-check-outline': MapPinCheck, 'map-marker-distance': MapPinned,
  'map-marker-outline': MapPin, 'map-marker-plus': MapPinPlus, 'map-marker-radius': MapPinned,
  'map-marker-radius-outline': MapPinned, message: MessageSquare, 'message-plus-outline': MessageSquare,
  microphone: Mic, minus: Minus, 'moon-waning-crescent': Moon, 'theme-light-dark': SunMoon,
  'white-balance-sunny': Sun, numeric: Circle,
  'office-building': Building2, 'open-in-new': ExternalLink, 'package-variant': Package,
  'pause-circle-outline': PauseCircle, pencil: Pencil, 'pencil-outline': Pencil,
  'phone-dial': Phone, 'phone-outline': Phone, pin: Pin, 'pin-off-outline': PinOff,
  plus: Plus, 'plus-circle-outline': CirclePlus, receipt: Receipt,
  'receipt-text-outline': ReceiptText, refresh: RefreshCw, replay: RotateCcw, reply: Reply,
  'sale-tag': Tag, search: Search, 'secure-account': ShieldCheck, send: Send, shape: Shapes,
  'share-outline': Share2, 'share-variant': Share2, 'share-variant-outline': Share2,
  'shield-alert': ShieldAlert, 'shield-alert-outline': ShieldAlert, 'shield-check': ShieldCheck,
  'shield-check-outline': ShieldCheck, 'shield-lock': LockKeyhole, 'shield-lock-outline': LockKeyhole,
  'shield-search': ShieldQuestion, 'shopping-outline': ShoppingBag, 'sim': Smartphone,
  'sim-alert': Smartphone, star: Star, 'star-four-points': Sparkles, 'star-outline': Star,
  'store-plus': Store, 'store-plus-outline': Store, storefront: Store, 'storefront-outline': Store,
  'swap-horizontal': ArrowUpRight, 'tag-outline': Tag, 'text-box-outline': FileText,
  'thumb-down-outline': ThumbsDown, 'thumb-up-outline': ThumbsUp,
  'timeline-text-outline': Activity, 'timer-outline': Timer, time: Clock, translate: Languages,
  'trash-can-outline': Trash2, 'truck-delivery-outline': Truck, 'tune-variant': SlidersHorizontal,
  verified: BadgeCheck, 'wifi-off': WifiOff, close: X, 'close-circle': CircleX,
  'close-circle-outline': CircleX, 'image-unavailable': ImageOff, back: ArrowLeft,
  rating: Star, 'rate-this': Star, 'offer-coin': CircleDollarSign, 'qr-code': QrCode,
  'my-location': Navigation, 'add-photo': Image, 'cart-outline': ShoppingCart,
};

const FILLED = new Set(['heart', 'star', 'fire', 'check', 'plus', 'minus']);

export function MaterialCommunityIcons({
  name, size = 24, color = COLORS.text, style, accessibilityLabel, ...props
}: {
  name: string;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  [key: string]: unknown;
}) {
  const Icon = ICONS[name] || CircleHelp;
  return (
    <Icon
      size={size}
      color={color as string}
      strokeWidth={2}
      fill={FILLED.has(name) ? (color as string) : 'none'}
      style={style}
      accessibilityLabel={accessibilityLabel}
      {...props as any}
    />
  );
}

