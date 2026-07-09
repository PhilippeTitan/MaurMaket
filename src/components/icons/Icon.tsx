import React from 'react';
import { CloseIcon } from './close';
import { CloseCircleIcon } from './closeCircle';
import { CheckIcon } from './check';
import { CheckCircleIcon } from './checkCircle';
import { ChevronRightIcon } from './chevronRight';
import { BackIcon } from './back';
import { EditIcon } from './edit';
import { MinusIcon } from './minus';
import { VerifiedIcon } from './verified';
import { LockedIcon } from './locked';
import { InfoIcon } from './info';
import { AlertIcon } from './alert';
import { StorefrontIcon } from './storefront';
import { SaleTagIcon } from './saleTag';
import { CartIcon } from './cart';
import { PackageIcon } from './package';
import { DeliveryIcon } from './delivery';
import { OfferCoinIcon } from './offerCoin';
import { LocationPinIcon } from './locationPin';
import { MyLocationIcon } from './myLocation';
import { CameraIcon } from './camera';
import { AddPhotoIcon } from './addPhoto';
import { ImageUnavailableIcon } from './imageUnavailable';
import { RatingIcon } from './rating';
import { RateThisIcon } from './rateThis';
import { MessageIcon } from './message';
import { QrCodeIcon } from './qrCode';
import { TimeIcon } from './time';
import { SecureAccountIcon } from './secureAccount';
import { FeedIcon } from './feed';
import { SearchIcon } from './search';
import { PlusIcon } from './plus';
import { MapIcon } from './map';
import { MeIcon } from './me';

export type IconName =
  | 'close' | 'close-circle' | 'check' | 'check-circle' | 'chevron-right'
  | 'back' | 'edit' | 'minus' | 'verified' | 'locked' | 'info' | 'alert'
  | 'storefront' | 'sale-tag' | 'cart' | 'package' | 'delivery' | 'offer-coin'
  | 'location-pin' | 'my-location' | 'camera' | 'add-photo' | 'image-unavailable'
  | 'rating' | 'rate-this' | 'message' | 'qr-code' | 'time' | 'secure-account'
  | 'feed' | 'search' | 'plus' | 'map' | 'me';

const MCI_MAP: Record<string, IconName> = {
  close: 'close',
  'close-circle': 'close-circle',
  check: 'check',
  'check-circle': 'check-circle',
  'chevron-right': 'chevron-right',
  'arrow-left': 'back',
  'pencil-outline': 'edit',
  minus: 'minus',
  'shield-check': 'verified',
  'lock-outline': 'locked',
  'information-outline': 'info',
  'alert-circle-outline': 'alert',
  'storefront-outline': 'storefront',
  'tag-outline': 'sale-tag',
  'cart-outline': 'cart',
  'package-variant': 'package',
  'truck-delivery': 'delivery',
  'hand-coin-outline': 'offer-coin',
  'map-marker': 'location-pin',
  'crosshairs-gps': 'my-location',
  camera: 'camera',
  'camera-plus': 'add-photo',
  'image-off-outline': 'image-unavailable',
  star: 'rating',
  'star-outline': 'rate-this',
  'message-outline': 'message',
  qrcode: 'qr-code',
  'clock-outline': 'time',
  'shield-lock-outline': 'secure-account',
  fire: 'feed',
  magnify: 'search',
  plus: 'plus',
  'map-marker-radius': 'map',
  account: 'me',
};

const ICONS: Record<IconName, React.FC<{ size?: number; color?: string; strokeWidth?: number }>> = {
  close: CloseIcon,
  'close-circle': CloseCircleIcon,
  check: CheckIcon,
  'check-circle': CheckCircleIcon,
  'chevron-right': ChevronRightIcon,
  back: BackIcon,
  edit: EditIcon,
  minus: MinusIcon,
  verified: VerifiedIcon,
  locked: LockedIcon,
  info: InfoIcon,
  alert: AlertIcon,
  storefront: StorefrontIcon,
  'sale-tag': SaleTagIcon,
  cart: CartIcon,
  package: PackageIcon,
  delivery: DeliveryIcon,
  'offer-coin': OfferCoinIcon,
  'location-pin': LocationPinIcon,
  'my-location': MyLocationIcon,
  camera: CameraIcon,
  'add-photo': AddPhotoIcon,
  'image-unavailable': ImageUnavailableIcon,
  rating: RatingIcon,
  'rate-this': RateThisIcon,
  message: MessageIcon,
  'qr-code': QrCodeIcon,
  time: TimeIcon,
  'secure-account': SecureAccountIcon,
  feed: FeedIcon,
  search: SearchIcon,
  plus: PlusIcon,
  map: MapIcon,
  me: MeIcon,
};

export function getIconName(mciName: string): IconName | null {
  return MCI_MAP[mciName] ?? null;
}

export function Icon({ name, size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const C = ICONS[name];
  return <C size={size} color={color} strokeWidth={strokeWidth} />;
}
