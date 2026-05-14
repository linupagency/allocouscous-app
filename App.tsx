import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppState,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
  type ImageSourcePropType,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLinking from 'expo-linking';
import { adminSupabase, isSupabaseConfigured, supabase } from './src/lib/supabase';

const applyNativeTextDefaults = () => {
  try {
    const textDefaults = Text as unknown as { defaultProps?: Record<string, unknown> };
    if (Object.isExtensible(Text)) {
      textDefaults.defaultProps = { ...textDefaults.defaultProps, allowFontScaling: false };
    }
    const textInputDefaults = TextInput as unknown as { defaultProps?: Record<string, unknown> };
    if (Object.isExtensible(TextInput)) {
      textInputDefaults.defaultProps = { ...textInputDefaults.defaultProps, allowFontScaling: false };
    }
  } catch (error) {
    console.warn('Réglage texte ignoré au démarrage', error);
  }
};

applyNativeTextDefaults();

type Screen = 'welcome' | 'restaurants' | 'menu' | 'cart' | 'checkout' | 'orders' | 'tracking' | 'profile' | 'admin';
type OrderStatus = 'Nouvelle' | 'Acceptée' | 'En préparation' | 'Prête' | 'Terminée' | 'Annulée';
type AdminTab = 'Cuisine' | 'Commandes' | 'Menu' | 'Catégories' | 'Restaurants' | 'Stats' | 'Offres' | 'Coupons' | 'Notifications' | 'Avis';
type KitchenDateFilter = 'today' | 'tomorrow' | 'future' | 'all';

type Restaurant = {
  id: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  schedule?: RestaurantScheduleDay[];
  isOpen: boolean;
  nextSlot: string;
  capacityPerSlot: number;
  acceptingOrders?: boolean;
  exceptionalClosedUntil?: string;
  archived?: boolean;
};

type RestaurantScheduleDay = {
  id: string;
  label: string;
  closed: boolean;
  lunchStart: string;
  lunchEnd: string;
  dinnerStart: string;
  dinnerEnd: string;
};

type Category = {
  id: string;
  label: string;
  icon: string;
  description: string;
  restaurantIds?: string[];
};

type Extra = {
  id: string;
  name: string;
  price: number;
};

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  prepMinutes: number;
  available: boolean;
  image: string;
  extras: Extra[];
  restaurantIds?: string[];
  labels?: string[];
  allergens?: string[];
};

type CartItem = {
  product: Product;
  quantity: number;
  extras: Extra[];
  note: string;
};

type SerializedCartItem = {
  productId: string;
  quantity: number;
  extras: Extra[];
  note: string;
};

type SerializedCartPayload = {
  restaurantId: string;
  items: SerializedCartItem[];
};

type Order = {
  id: string;
  restaurantId: string;
  createdAt: string;
  pickupAt: string;
  status: OrderStatus;
  total: number;
  items: CartItem[];
  userId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerPostalAddress?: string;
  couponCode?: string;
  loyaltyDiscount?: number;
  notifyWhenReady?: boolean;
  isPreorder?: boolean;
  trackingToken?: string;
  refusalReason?: string;
  estimatedPrepMinutes?: number;
};

type Review = {
  id: string;
  orderId: string;
  userId?: string;
  rating: number;
  comment: string;
  createdAt: string;
};

type CheckoutPayload = {
  pickupAt: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  notifyWhenReady: boolean;
};

type CouponConfig = {
  code: string;
  active: boolean;
  type: 'percent' | 'fixed';
  value: number;
  minAmount: number;
  used: number;
  maxUses: number;
};

type OfferConfig = {
  id: string;
  title: string;
  text: string;
  image: string;
  active: boolean;
};

type PushCampaign = {
  id: string;
  title: string;
  message: string;
  audience: string;
  createdAt: string;
};

type OfferPushCampaign = {
  id: string;
  title: string;
  message: string;
  audience: string;
  createdAt: string;
};

type PushDiagnostics = {
  consentingProfiles: number;
  marketingTokens: number;
  enabledMarketingTokens: number;
  lastCheckedAt: string;
  error?: string;
};

type ClientNotification = {
  title: string;
  message: string;
};

type ProfileData = {
  userId?: string;
  firstName: string;
  name: string;
  email: string;
  phone: string;
  postalAddress: string;
  preferredRestaurantId: string;
  marketingConsent: boolean;
  marketingPushConsent: boolean;
  accountCreated: boolean;
};

type CustomerAccountPayload = {
  firstName: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  postalAddress: string;
  preferredRestaurantId: string;
  marketingConsent: boolean;
  marketingPushConsent: boolean;
};

type WelcomeEmailPayload = Omit<CustomerAccountPayload, 'password'>;

type CustomerProfileRow = {
  role: 'customer' | 'kitchen' | 'manager' | 'admin';
  first_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  postal_address?: string | null;
  preferred_restaurant_id?: string | null;
  marketing_consent?: boolean | null;
  marketing_push_consent?: boolean | null;
  welcome_email_sent_at?: string | null;
};

type CustomerAccountCreateResult =
  | { ok: true; successMessage: string }
  | { ok: false; error: string };

type CampaignSendResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type PickupSlotOption = {
  dayLabel: string;
  timeLabel: string;
  dateKey: string;
  value: string;
  remaining: number;
  isFull: boolean;
};

type SlotMode = 'today' | 'tomorrow' | 'plan';

type LoyaltyState = {
  points: number;
  totalSpent: number;
  rewardsClaimed: number;
  rewardCredits: number;
};

type StoredState<T> = T | ((current: T) => T);
type AdminProfile = {
  id: string;
  email: string;
  role: 'customer' | 'kitchen' | 'manager' | 'admin';
};

const ADMIN_ALLOWED_ROLES: AdminProfile['role'][] = ['kitchen', 'manager', 'admin'];
const ALL_ADMIN_TABS: AdminTab[] = ['Cuisine', 'Commandes', 'Menu', 'Catégories', 'Restaurants', 'Stats', 'Offres', 'Coupons', 'Notifications', 'Avis'];
const KITCHEN_ADMIN_TABS: AdminTab[] = ['Cuisine', 'Commandes'];
const canAccessAdmin = (role?: AdminProfile['role'] | null) => Boolean(role && ADMIN_ALLOWED_ROLES.includes(role));

const colors = {
  red: '#ad1b1f',
  darkRed: '#941619',
  coral: '#ff6b6b',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e8ded5',
  warm: '#f6f7f8',
  surface: '#f6f7f8',
  card: '#ffffff',
  action: '#ad1b1f',
  gold: '#d99a29',
  charcoal: '#3e3e3e',
  success: '#15803d',
};

const restaurantHero = require('./assets/header-allocouscous.jpg') as ImageSourcePropType;
const clientLogo = require('./assets/logo-allocouscous.png') as ImageSourcePropType;
const appLogo = require('./assets/logo-app.png') as ImageSourcePropType;
const tajineImage =
  'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=900&q=80';
const couscousImage =
  'https://images.unsplash.com/photo-1579027989536-b7b1f875659b?auto=format&fit=crop&w=900&q=80';
const pastryImage =
  'https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=900&q=80';
const teaImage =
  'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=80';

const scheduleDays: RestaurantScheduleDay[] = [
  { id: 'monday', label: 'Lundi', closed: false, lunchStart: '11:00', lunchEnd: '14:00', dinnerStart: '17:00', dinnerEnd: '21:00' },
  { id: 'tuesday', label: 'Mardi', closed: false, lunchStart: '11:00', lunchEnd: '14:00', dinnerStart: '17:00', dinnerEnd: '21:00' },
  { id: 'wednesday', label: 'Mercredi', closed: false, lunchStart: '11:00', lunchEnd: '14:00', dinnerStart: '17:00', dinnerEnd: '21:00' },
  { id: 'thursday', label: 'Jeudi', closed: false, lunchStart: '11:00', lunchEnd: '14:00', dinnerStart: '17:00', dinnerEnd: '21:00' },
  { id: 'friday', label: 'Vendredi', closed: false, lunchStart: '11:00', lunchEnd: '14:00', dinnerStart: '17:00', dinnerEnd: '21:00' },
  { id: 'saturday', label: 'Samedi', closed: false, lunchStart: '11:00', lunchEnd: '14:00', dinnerStart: '17:00', dinnerEnd: '21:00' },
  { id: 'sunday', label: 'Dimanche', closed: false, lunchStart: '11:00', lunchEnd: '14:00', dinnerStart: '17:00', dinnerEnd: '21:00' },
];

const dayIdByDateIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const restaurants: Restaurant[] = [
  {
    id: 'lille',
    name: 'Allo Couscous Lille',
    address: '19 Boulevard Montebello, 59000 Lille',
    phone: '03 20 40 27 37',
    hours: '11:00-14:00 · 17:00-21:00',
    isOpen: false,
    nextSlot: '17:00',
    capacityPerSlot: 4,
    acceptingOrders: true,
    exceptionalClosedUntil: '',
    archived: false,
  },
  {
    id: 'armentieres',
    name: 'Allo Couscous Armentières',
    address: '66 rue de Dunkerque, 59280 Armentières',
    phone: '03 20 73 63 03',
    hours: '11:00-14:00 · 17:30-21:30',
    isOpen: false,
    nextSlot: '17:30',
    capacityPerSlot: 3,
    acceptingOrders: true,
    exceptionalClosedUntil: '',
    archived: false,
  },
];

const initialCategories: Category[] = [
  { id: 'Entrées', label: 'Entrées', icon: '🥗', description: 'Entrées traditionnelles' },
  { id: 'Couscous', label: 'Couscous', icon: '🍲', description: 'Couscous généreux' },
  { id: 'Suppléments', label: 'Suppléments', icon: '+', description: 'Accompagnements' },
  { id: 'Tajines', label: 'Tajines', icon: '🥘', description: 'Tajines mijotés' },
  { id: 'Pâtisseries', label: 'Pâtisseries', icon: '🍪', description: 'Pâtisseries maison' },
  { id: 'Boissons', label: 'Boissons', icon: '☕', description: 'Boissons fraîches et chaudes' },
];

const initialOffer: OfferConfig = {
  id: 'tajines-week',
  title: 'Découvrez nos Tajines',
  text: "Cette semaine, tous nos tajines sont à l'honneur : agneau, poulet, kefta...",
  image: tajineImage,
  active: true,
};

const initialProducts: Product[] = [
  {
    id: 'feuillete-kefta',
    name: 'Feuilleté farci "Kefta"',
    description: 'Feuilleté doré garni de viande hachée épicée.',
    category: 'Entrées',
    price: 8.5,
    prepMinutes: 10,
    available: true,
    image: tajineImage,
    extras: [
      { id: 'harissa', name: 'Harissa maison', price: 0.5 },
      { id: 'salade', name: 'Petite salade', price: 2 },
    ],
    labels: ['Épicé'],
    allergens: ['Gluten', 'Œuf'],
  },
  {
    id: 'pastilla-poulet',
    name: 'Pastilla poulet ou agneau',
    description: 'Pastilla croustillante, parfumée aux épices douces.',
    category: 'Entrées',
    price: 10,
    prepMinutes: 10,
    available: true,
    image: tajineImage,
    extras: [{ id: 'citron', name: 'Citron confit', price: 1 }],
    labels: ['Maison'],
    allergens: ['Gluten', 'Fruits à coque'],
  },
  {
    id: 'salade-carottes',
    name: 'Salade de carottes au cumin "Kemia"',
    description: 'Carottes fondantes, cumin, herbes fraîches.',
    category: 'Entrées',
    price: 5,
    prepMinutes: 5,
    available: true,
    image: couscousImage,
    extras: [],
    labels: ['Végétarien'],
    allergens: [],
  },
  {
    id: 'harira',
    name: 'Soupe Marocaine "Harira"',
    description: 'Soupe traditionnelle aux pois chiches et coriandre.',
    category: 'Entrées',
    price: 6,
    prepMinutes: 5,
    available: true,
    image: couscousImage,
    extras: [],
    labels: ['Maison'],
    allergens: ['Gluten'],
  },
  {
    id: 'couscous-royal',
    name: 'Couscous Royal',
    description: 'Semoule fine, légumes, merguez, brochette et boulette.',
    category: 'Couscous',
    price: 25,
    prepMinutes: 25,
    available: true,
    image: couscousImage,
    extras: [
      { id: 'semoule', name: 'Semoule supplémentaire', price: 3 },
      { id: 'bouillon', name: 'Bouillon légumes', price: 2 },
    ],
    labels: ['Signature'],
    allergens: ['Gluten'],
  },
  {
    id: 'brochettes-agneau',
    name: 'Brochettes agneau',
    description: "Semoule fine, légumes et brochette d'agneau tendre.",
    category: 'Couscous',
    price: 20,
    prepMinutes: 20,
    available: true,
    image: couscousImage,
    extras: [{ id: 'merguez', name: 'Merguez', price: 3 }],
    labels: ['Signature'],
    allergens: ['Gluten'],
  },
  {
    id: 'tajine-pruneaux-poulet',
    name: 'Poulet, pruneaux, amandes',
    description: 'Tajine sucré-salé au poulet, pruneaux et amandes grillées.',
    category: 'Tajines',
    price: 19,
    prepMinutes: 25,
    available: true,
    image: tajineImage,
    extras: [{ id: 'amandes', name: 'Amandes grillées', price: 1.5 }],
    labels: ['Sucré salé'],
    allergens: ['Fruits à coque'],
  },
  {
    id: 'tajine-citron',
    name: 'Poulet, olives, citron',
    description: 'Poulet mijoté aux citrons confits et olives.',
    category: 'Tajines',
    price: 19,
    prepMinutes: 25,
    available: true,
    image: tajineImage,
    extras: [],
    labels: ['Maison'],
    allergens: [],
  },
  {
    id: 'supplement-semoule',
    name: 'Supplément semoule',
    description: 'Portion de semoule fine vapeur.',
    category: 'Suppléments',
    price: 6,
    prepMinutes: 2,
    available: true,
    image: couscousImage,
    extras: [],
    labels: ['Végétarien'],
    allergens: ['Gluten'],
  },
  {
    id: 'corne-gazelle',
    name: 'Corne de gazelle',
    description: 'Pâtisserie aux amandes en forme de croissant.',
    category: 'Pâtisseries',
    price: 1.5,
    prepMinutes: 1,
    available: true,
    image: pastryImage,
    extras: [],
    labels: ['Maison'],
    allergens: ['Gluten', 'Fruits à coque'],
  },
  {
    id: 'the-menthe',
    name: 'Thé à la menthe',
    description: 'Thé vert à la menthe fraîche.',
    category: 'Boissons',
    price: 2,
    prepMinutes: 1,
    available: true,
    image: teaImage,
    extras: [],
    labels: ['Sans alcool'],
    allergens: [],
  },
];

/** Aucune commande suivie : évite d’utiliser de fausses données de démo sur mobile. */
const NO_TRACKED_ORDER_ID = '__none__';

const placeholderTrackedOrder = (): Order => ({
  id: NO_TRACKED_ORDER_ID,
  restaurantId: restaurants[0]?.id ?? 'lille',
  createdAt: '',
  pickupAt: '',
  status: 'Terminée',
  total: 0,
  items: [],
  trackingToken: '',
});

const initialCoupon: CouponConfig = {
  code: 'PROMO10',
  active: true,
  type: 'percent',
  value: 10,
  minAmount: 20,
  used: 1,
  maxUses: 5,
};

const rewardThreshold = 10;
const rewardValue = 10;

const initialLoyalty: LoyaltyState = {
  points: 0,
  totalSpent: 0,
  rewardsClaimed: 0,
  rewardCredits: 0,
};

const initialProfile: ProfileData = {
  firstName: '',
  name: '',
  email: '',
  phone: '',
  postalAddress: '',
  preferredRestaurantId: 'lille',
  marketingConsent: false,
  marketingPushConsent: false,
  accountCreated: false,
};

const initialPushCampaigns: PushCampaign[] = [];
const initialOfferPushCampaigns: OfferPushCampaign[] = [];

const customerProfileSelectBase =
  'role,first_name,full_name,email,phone,postal_address,preferred_restaurant_id,marketing_consent,marketing_push_consent' as const;
const customerProfileSelectWithWelcome =
  'role,first_name,full_name,email,phone,postal_address,preferred_restaurant_id,marketing_consent,marketing_push_consent,welcome_email_sent_at' as const;

const orderSteps: OrderStatus[] = ['Nouvelle', 'Acceptée', 'En préparation', 'Prête', 'Terminée'];

const formatPrice = (price: number) => `${price.toFixed(2)} €`;

const normalizeTextKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addLocalDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const parseOrderPickupDate = (pickupAt: string) => {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(pickupAt)) {
    return new Date(`${pickupAt.replace(' ', 'T')}:00`);
  }
  const frenchMatch = pickupAt.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (frenchMatch) {
    const [, day, month, year, hours, minutes] = frenchMatch;
    return new Date(`${year}-${month}-${day}T${hours}:${minutes}:00`);
  }
  const parsedDate = new Date(pickupAt);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getKitchenPickupDateLabel = (order: Order) => {
  const pickupDate = parseOrderPickupDate(order.pickupAt);
  if (!pickupDate) {
    return 'Date à vérifier';
  }
  const todayKey = formatLocalDate(new Date());
  const tomorrowKey = formatLocalDate(addLocalDays(new Date(), 1));
  const pickupKey = formatLocalDate(pickupDate);
  const pickupTime = pickupDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (pickupKey === todayKey) {
    return `Aujourd’hui ${pickupTime}`;
  }
  if (pickupKey === tomorrowKey) {
    return `Demain ${pickupTime}`;
  }
  return pickupDate.toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const matchesKitchenDateFilter = (order: Order, filter: KitchenDateFilter) => {
  if (filter === 'all') {
    return true;
  }
  const pickupDate = parseOrderPickupDate(order.pickupAt);
  if (!pickupDate) {
    return filter === 'today';
  }
  const todayKey = formatLocalDate(new Date());
  const tomorrowKey = formatLocalDate(addLocalDays(new Date(), 1));
  const pickupKey = formatLocalDate(pickupDate);
  if (filter === 'today') {
    return pickupKey === todayKey;
  }
  if (filter === 'tomorrow') {
    return pickupKey === tomorrowKey;
  }
  return pickupKey > tomorrowKey;
};

const compareOrdersByPickup = (firstOrder: Order, secondOrder: Order) => {
  const firstDate = parseOrderPickupDate(firstOrder.pickupAt);
  const secondDate = parseOrderPickupDate(secondOrder.pickupAt);
  return (firstDate?.getTime() ?? 0) - (secondDate?.getTime() ?? 0);
};

const getKitchenOrderUrgency = (order: Order) => {
  if (!matchesKitchenDateFilter(order, 'today') || ['Terminée', 'Annulée'].includes(order.status)) {
    return null;
  }
  const pickupDate = parseOrderPickupDate(order.pickupAt);
  if (!pickupDate) {
    return null;
  }
  const minutesUntilPickup = Math.round((pickupDate.getTime() - Date.now()) / 60000);
  if (minutesUntilPickup < 0) {
    return {
      level: 'late' as const,
      label: `Retrait dépassé de ${Math.abs(minutesUntilPickup)} min`,
    };
  }
  if (minutesUntilPickup <= 30) {
    return {
      level: 'soon' as const,
      label: `Retrait dans ${Math.max(minutesUntilPickup, 0)} min`,
    };
  }
  return null;
};

const formatPickupDayLabel = (date: Date, dayOffset: number) => {
  if (dayOffset === 0) return "Aujourd'hui";
  if (dayOffset === 1) return 'Demain';
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

const formatDateTimeForDisplay = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const createTrackingToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;

const parsePickupAtToIso = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}:00`).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const getPickupSlotKey = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const frenchMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (frenchMatch) {
    const [, day, month, year, hours, minutes] = frenchMatch;
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${formatLocalDate(date)} ${hours}:${minutes}`;
};

const canUseBrowserNotifications = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;

const requestClientNotificationPermission = async () => {
  if (!canUseBrowserNotifications()) {
    return;
  }
  const BrowserNotification = window.Notification;
  if (BrowserNotification.permission === 'default') {
    await BrowserNotification.requestPermission();
  }
};

const sendBrowserNotification = (notification: ClientNotification) => {
  if (!canUseBrowserNotifications()) {
    return;
  }
  const BrowserNotification = window.Notification;
  if (BrowserNotification.permission === 'granted') {
    new BrowserNotification(notification.title, { body: notification.message });
  }
};

const getExpoProjectId = () =>
  Constants.easConfig?.projectId ??
  Constants.expoConfig?.extra?.eas?.projectId ??
  Constants.manifest2?.extra?.eas?.projectId;

let mobileNotificationHandlerReady = false;

const loadMobileNotifications = async () => {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    const Notifications = await import('expo-notifications');
    if (!mobileNotificationHandlerReady) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      mobileNotificationHandlerReady = true;
    }
    return Notifications;
  } catch (error) {
    console.warn('Module notifications indisponible', error);
    return null;
  }
};

type MobilePushTokenResult = {
  token: string | null;
  reason?: string;
};

const getMobileExpoPushTokenResult = async (): Promise<MobilePushTokenResult> => {
  if (Platform.OS === 'web') {
    return { token: null, reason: 'Les notifications push sont disponibles uniquement dans l’application mobile installée.' };
  }
  const Notifications = await loadMobileNotifications();
  if (!Notifications) {
    return { token: null, reason: 'Le module notifications n’est pas disponible dans ce build. Réinstalle le dernier APK.' };
  }
  const Device = await import('expo-device').catch((error) => {
    console.warn('Module device indisponible', error);
    return null;
  });
  if (!Device?.isDevice) {
    return { token: null, reason: 'Les notifications push doivent être testées sur un vrai téléphone.' };
  }
  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn('Expo projectId manquant: le token push mobile sera activé après configuration EAS.');
    return { token: null, reason: 'Identifiant Expo manquant dans le build. Recrée un build EAS.' };
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Commandes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ad1b1f',
    });
  }
  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;
  if (finalStatus !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }
  if (finalStatus !== 'granted') {
    return { token: null, reason: 'Autorise les notifications dans les réglages du téléphone, puis réessaie.' };
  }
  try {
    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: pushToken.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue pendant la création du token push.';
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('firebaseapp') || lowerMessage.includes('fcm-credentials') || lowerMessage.includes('firebase')) {
      return {
        token: null,
        reason:
          'Android n’est pas encore relié à Firebase/FCM. Ajoute google-services.json dans le projet, configure la clé FCM V1 dans Expo, puis recrée un build Android.',
      };
    }
    return { token: null, reason: message };
  }
};

const getMobileExpoPushToken = async () => {
  const result = await getMobileExpoPushTokenResult();
  return result.token;
};

const getClientNotification = (order: Order): ClientNotification | null => {
  switch (order.status) {
    case 'Acceptée':
      return {
        title: 'Commande acceptée',
        message: `Votre commande ${order.id} a été acceptée par le restaurant.`,
      };
    case 'Annulée':
      return {
        title: 'Commande refusée',
        message: order.refusalReason || 'Le restaurant ne peut pas préparer cette commande.',
      };
    case 'Prête':
      if (order.notifyWhenReady === false) {
        return null;
      }
      return {
        title: 'Commande prête',
        message: `Votre commande ${order.id} est prête à être retirée.`,
      };
    default:
      return null;
  }
};

const getRestaurant = (id: string) => restaurants.find((restaurant) => restaurant.id === id) ?? restaurants[0];

const getProfileDisplayName = (profile: Pick<ProfileData, 'firstName' | 'name'>) =>
  [profile.firstName, profile.name].map((value) => value.trim()).filter(Boolean).join(' ') || 'Client';

const getPrivacyPolicyUrl = (): string | null => {
  const raw = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim();
  if (!raw) {
    return null;
  }
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const getStoreUrl = (platform: 'ios' | 'android'): string | null => {
  const raw = platform === 'ios' ? process.env.EXPO_PUBLIC_IOS_APP_URL : process.env.EXPO_PUBLIC_ANDROID_APP_URL;
  const cleanUrl = raw?.trim();
  if (!cleanUrl) {
    return null;
  }
  return /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
};

const getPreferredStore = (): 'ios' | 'android' | 'desktop' => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'desktop';
  }
  const userAgent = navigator.userAgent.toLowerCase();
  const touchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  if (userAgent.includes('android')) {
    return 'android';
  }
  if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod')) {
    return 'ios';
  }
  if (userAgent.includes('macintosh') && touchPoints > 1) {
    return 'ios';
  }
  return 'desktop';
};

const openStoreUrl = async (platform: 'ios' | 'android') => {
  const url = getStoreUrl(platform);
  if (!url) {
    Alert.alert('Lien bientôt disponible', 'Le lien sera ajouté dès que l’application sera publiée sur le store.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Lien indisponible', 'Impossible d’ouvrir le store pour le moment.');
  }
};

const openPrivacyPolicyUrl = async () => {
  const url = getPrivacyPolicyUrl();
  if (!url) {
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Lien indisponible', 'Impossible d’ouvrir la page pour le moment.');
  }
};

const openRestaurantDirections = async (restaurant: Restaurant) => {
  const destination = encodeURIComponent(`${restaurant.name}, ${restaurant.address}`);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;

  try {
    await Linking.openURL(mapsUrl);
  } catch {
    Alert.alert('Itinéraire indisponible', 'Impossible d’ouvrir l’application de navigation pour le moment.');
  }
};

const callRestaurant = async (restaurant: Restaurant) => {
  const phoneNumber = restaurant.phone.replace(/[^\d+]/g, '');
  if (!phoneNumber) {
    Alert.alert('Numéro indisponible', 'Aucun numéro de téléphone n’est renseigné pour ce restaurant.');
    return;
  }
  try {
    await Linking.openURL(`tel:${phoneNumber}`);
  } catch {
    Alert.alert('Appel indisponible', 'Impossible d’ouvrir l’appel téléphonique pour le moment.');
  }
};

const readFileAsDataUrl = (file: any) =>
  new Promise<string>((resolve, reject) => {
    const FileReaderConstructor = (globalThis as any).FileReader;
    if (!FileReaderConstructor) {
      reject(new Error('FileReader indisponible'));
      return;
    }
    const reader = new FileReaderConstructor();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });

const productImagesBucket = 'product-images';

const getImageExtensionFromMime = (mimeType: string) => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
};

const uploadImageToSupabaseStorage = async (dataUrl: string, folder: string) => {
  if (!isSupabaseConfigured || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const contentType = blob.type || 'image/jpeg';
  const extension = getImageExtensionFromMime(contentType);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { error } = await supabase.storage.from(productImagesBucket).upload(path, blob, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    throw error;
  }
  const { data } = supabase.storage.from(productImagesBucket).getPublicUrl(path);
  return data.publicUrl;
};

const resizeImageDataUrl = (dataUrl: string, maxSize = 1400, quality = 0.84) =>
  new Promise<string>((resolve) => {
    const BrowserImage = (globalThis as any).Image;
    const browserDocument = (globalThis as any).document;
    if (!BrowserImage || !browserDocument) {
      resolve(dataUrl);
      return;
    }
    const imageElement = new BrowserImage();
    imageElement.onload = () => {
      const longestSide = Math.max(imageElement.width, imageElement.height);
      const scale = Math.min(1, maxSize / longestSide);
      const canvas = browserDocument.createElement('canvas');
      canvas.width = Math.max(1, Math.round(imageElement.width * scale));
      canvas.height = Math.max(1, Math.round(imageElement.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    imageElement.onerror = () => resolve(dataUrl);
    imageElement.src = dataUrl;
  });

const pickImageFromDevice = (onImageSelected: (imageDataUrl: string) => void | Promise<void>) => {
  const browserDocument = (globalThis as any).document;
  if (Platform.OS !== 'web' || !browserDocument) {
    Alert.alert('Sélection indisponible', 'Le choix de fichier est disponible depuis la console admin dans un navigateur.');
    return;
  }
  const input = browserDocument.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      Alert.alert('Format invalide', 'Choisis une image au format JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      Alert.alert('Image trop lourde', 'Choisis une image de moins de 8 Mo.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const resizedDataUrl = await resizeImageDataUrl(dataUrl);
      await onImageSelected(resizedDataUrl);
    } catch {
      Alert.alert('Image non importée', 'Impossible de lire cette photo. Essaie avec une autre image.');
    }
  };
  input.click();
};

const normalizeTimeInput = (time: string) => {
  const trimmedTime = time.trim().toLowerCase().replace('h', ':').replace('.', ':');
  const [rawHours = '', rawMinutes = '0'] = trimmedTime.split(':');
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes || '0');
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time.trim();
  }
  return `${Math.max(0, Math.min(hours, 23)).toString().padStart(2, '0')}:${Math.max(0, Math.min(minutes, 59)).toString().padStart(2, '0')}`;
};

const parseTimeToMinutes = (time: string) => {
  const normalizedTime = normalizeTimeInput(time);
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.NaN;
  }
  return hours * 60 + minutes;
};

const parseRestaurantHours = (hours: string) => {
  const windows = hours.split('·').map((window) => window.trim());
  const [lunch, dinner] = windows.map((window) => {
    const [start, end] = window.split('-').map((time) => time.trim());
    return { start: normalizeTimeInput(start || ''), end: normalizeTimeInput(end || '') };
  });
  return {
    lunchStart: lunch?.start || '11:00',
    lunchEnd: lunch?.end || '14:00',
    dinnerStart: dinner?.start || '17:00',
    dinnerEnd: dinner?.end || '21:00',
  };
};

const getDefaultScheduleFromHours = (hours: string) => {
  const parsed = parseRestaurantHours(hours);
  return scheduleDays.map((day) => ({ ...day, ...parsed }));
};

const normalizeRestaurantSchedule = (restaurant: Pick<Restaurant, 'hours' | 'schedule'>) => {
  const fallback = getDefaultScheduleFromHours(restaurant.hours);
  if (!Array.isArray(restaurant.schedule) || !restaurant.schedule.length) {
    return fallback;
  }
  return fallback.map((fallbackDay) => {
    const savedDay = restaurant.schedule?.find((day) => day.id === fallbackDay.id);
    const day = savedDay ? { ...fallbackDay, ...savedDay } : fallbackDay;
    return {
      ...day,
      lunchStart: normalizeTimeInput(day.lunchStart),
      lunchEnd: normalizeTimeInput(day.lunchEnd),
      dinnerStart: normalizeTimeInput(day.dinnerStart),
      dinnerEnd: normalizeTimeInput(day.dinnerEnd),
    };
  });
};

const getScheduleDayForDate = (restaurant: Restaurant, date: Date) => {
  const dayId = dayIdByDateIndex[date.getDay()];
  return normalizeRestaurantSchedule(restaurant).find((day) => day.id === dayId) ?? normalizeRestaurantSchedule(restaurant)[0];
};

const getOpenWindowsForDate = (restaurant: Restaurant, date: Date) => {
  const scheduleDay = getScheduleDayForDate(restaurant, date);
  if (scheduleDay.closed) {
    return [];
  }
  return [
    { start: scheduleDay.lunchStart, end: scheduleDay.lunchEnd },
    { start: scheduleDay.dinnerStart, end: scheduleDay.dinnerEnd },
  ]
    .map((window) => ({ ...window, startMinutes: parseTimeToMinutes(window.start), endMinutes: parseTimeToMinutes(window.end) }))
    .filter((window) => !Number.isNaN(window.startMinutes) && !Number.isNaN(window.endMinutes) && window.endMinutes > window.startMinutes);
};

const formatScheduleDayHours = (restaurant: Restaurant, date = new Date()) => {
  const scheduleDay = getScheduleDayForDate(restaurant, date);
  if (scheduleDay.closed) {
    return 'Fermé aujourd’hui';
  }
  const windows = getOpenWindowsForDate(restaurant, date).map((window) => `${window.start}-${window.end}`);
  return windows.length ? windows.join(' · ') : 'Fermé aujourd’hui';
};

const buildHoursSummary = (schedule: RestaurantScheduleDay[]) => {
  const firstOpenDay = schedule.find((day) => !day.closed);
  if (!firstOpenDay) {
    return 'Fermé';
  }
  return `${normalizeTimeInput(firstOpenDay.lunchStart)}-${normalizeTimeInput(firstOpenDay.lunchEnd)} · ${normalizeTimeInput(firstOpenDay.dinnerStart)}-${normalizeTimeInput(firstOpenDay.dinnerEnd)}`;
};

const formatMinutesToTime = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const hours = Math.floor(safeMinutes / 60).toString().padStart(2, '0');
  const mins = (safeMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
};

const getNextThirtyMinuteSlot = (minutes: number) => Math.ceil(minutes / 30) * 30;

const getRestaurantStatus = (restaurant: Restaurant) => {
  const now = new Date();
  const closedUntil = restaurant.exceptionalClosedUntil ? new Date(restaurant.exceptionalClosedUntil) : null;
  if (restaurant.acceptingOrders === false) {
    return {
      ...restaurant,
      isOpen: false,
      nextSlot: 'pause',
    };
  }
  if (closedUntil && !Number.isNaN(closedUntil.getTime()) && closedUntil > now) {
    return {
      ...restaurant,
      isOpen: false,
      nextSlot: closedUntil.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    };
  }
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const parsedWindows = getOpenWindowsForDate(restaurant, now);
  const currentWindow = parsedWindows.find((window) => currentMinutes >= window.startMinutes && currentMinutes < window.endMinutes);
  const nextWindow = parsedWindows.find((window) => currentMinutes < window.startMinutes);
  const nextOpenSlot = currentWindow
    ? formatMinutesToTime(Math.min(getNextThirtyMinuteSlot(currentMinutes + 20), currentWindow.endMinutes))
    : nextWindow?.start ?? parsedWindows[0]?.start ?? restaurant.nextSlot;
  return {
    ...restaurant,
    isOpen: Boolean(currentWindow),
    nextSlot: nextOpenSlot,
  };
};

const hasActiveExceptionalClosure = (restaurant: Restaurant) => {
  if (!restaurant.exceptionalClosedUntil) {
    return false;
  }
  const closedUntil = new Date(restaurant.exceptionalClosedUntil);
  return !Number.isNaN(closedUntil.getTime()) && closedUntil > new Date();
};

const canRestaurantReceiveOrders = (restaurant: Restaurant) => restaurant.acceptingOrders !== false && !hasActiveExceptionalClosure(restaurant);

const getRestaurantOrderLabel = (restaurant: Restaurant) => {
  if (restaurant.acceptingOrders === false) return 'Pause';
  if (restaurant.isOpen) return 'Ouvert';
  if (canRestaurantReceiveOrders(restaurant)) return 'Précommande';
  return 'Fermé';
};

const getLiveRestaurants = () => restaurants.map(getRestaurantStatus);

const getLiveRestaurant = (id: string) => getRestaurantStatus(getRestaurant(id));

const getPickupSlotOptions = (restaurant: Restaurant, orders: Order[] = []) => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slots: PickupSlotOption[] = [];
  const activeOrders = orders.filter((order) => order.restaurantId === restaurant.id && !['Annulée', 'Terminée'].includes(order.status));
  const getRemainingCapacity = (slotValue: string) => {
    const used = activeOrders.filter((order) => getPickupSlotKey(order.pickupAt) === slotValue).length;
    return Math.max(restaurant.capacityPerSlot - used, 0);
  };
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + dayOffset);
    const dateKey = formatLocalDate(targetDate);
    const dayLabel = formatPickupDayLabel(targetDate, dayOffset);
    const parsedWindows = getOpenWindowsForDate(restaurant, targetDate);
    parsedWindows.forEach((window) => {
      const firstAvailableMinute = dayOffset === 0 ? getNextThirtyMinuteSlot(currentMinutes + 20) : window.startMinutes;
      const start = Math.max(window.startMinutes, firstAvailableMinute);
      for (let minute = start; minute <= window.endMinutes; minute += 30) {
        const time = formatMinutesToTime(minute);
        const value = `${dateKey} ${time}`;
        const remaining = getRemainingCapacity(value);
        slots.push({
          dayLabel,
          timeLabel: time,
          dateKey,
          value,
          remaining,
          isFull: remaining <= 0,
        });
      }
    });
  }
  return slots;
};

const getItemTotal = (item: CartItem) => {
  const extrasTotal = item.extras.reduce((sum, extra) => sum + extra.price, 0);
  return (item.product.price + extrasTotal) * item.quantity;
};

const getOrderSubtotal = (items: CartItem[]) => items.reduce((sum, item) => sum + getItemTotal(item), 0);

const getOrderCouponDiscount = (order: Pick<Order, 'items' | 'total' | 'couponCode' | 'loyaltyDiscount'>) => {
  if (!order.couponCode) {
    return 0;
  }
  return Math.max(0, getOrderSubtotal(order.items) - Number(order.loyaltyDiscount ?? 0) - Number(order.total ?? 0));
};

const getAuthRefusalReason = (message?: string) => {
  const rawMessage = message?.trim();
  const lowerMessage = rawMessage?.toLowerCase() ?? '';
  if (lowerMessage.includes('invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (lowerMessage.includes('email not confirmed')) {
    return 'Email non confirmé : la confirmation email Supabase est encore active. Désactive-la dans Supabase Auth pour cette V1, ou confirme l’adresse depuis le mail reçu.';
  }
  if (lowerMessage.includes('too many') || lowerMessage.includes('rate limit')) {
    return 'Trop de tentatives. Réessaie dans quelques minutes.';
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return 'Connexion réseau impossible. Vérifie internet puis réessaie.';
  }
  return rawMessage || 'Motif non précisé par Supabase.';
};

const getWebPathname = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '/';
  }
  return window.location.pathname.replace(/\/$/, '') || '/';
};

const isAdminWebRoute = () => getWebPathname() === '/admin';

const isClientWebRoute = () => getWebPathname() === '/app';

const isPasswordResetRoute = () => getWebPathname() === '/auth/reset-password';

const isDownloadLandingRoute = () => Platform.OS === 'web' && !isAdminWebRoute() && !isClientWebRoute() && !isPasswordResetRoute();

const getPublicAppBaseUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) {
      return origin;
    }
  }
  const rawDomain = process.env.EXPO_PUBLIC_APP_DOMAIN?.trim();
  if (!rawDomain) {
    return undefined;
  }
  return /^https?:\/\//i.test(rawDomain)
    ? rawDomain.replace(/\/$/, '')
    : `https://${rawDomain.replace(/\/$/, '')}`;
};

const getPasswordResetRedirectUrl = () => {
  if (Platform.OS !== 'web') {
    try {
      const created = ExpoLinking.createURL('/auth/reset-password');
      if (__DEV__) {
        console.log('[pwd-reset-deep-link] createURL(/auth/reset-password)', { result: created });
      }
      return created;
    } catch {
      return undefined;
    }
  }
  const baseUrl = getPublicAppBaseUrl();
  return baseUrl ? `${baseUrl}/auth/reset-password` : undefined;
};

/** Détection route reset : chemins Expo Go, schéma custom, ou web prod (si l’URL arrive au handler natif). */
const isNativePasswordRecoveryDeepLink = (url: string) => {
  if (!url) {
    return false;
  }
  return url.includes('/auth/reset-password');
};

const getPasswordRecoveryUrlKind = (url: string): 'allocouscous' | 'expo-go' | 'https' | 'unknown' => {
  const lower = url.toLowerCase();
  if (lower.startsWith('allocouscous:')) {
    return 'allocouscous';
  }
  if (lower.startsWith('exp:') || lower.startsWith('exps:')) {
    return 'expo-go';
  }
  if (lower.startsWith('https:') || lower.startsWith('http:')) {
    return 'https';
  }
  return 'unknown';
};

const getPasswordRecoveryPathForLog = (url: string) => {
  try {
    return new URL(url).pathname || '(empty-path)';
  } catch {
    return '(parse-error)';
  }
};

const parseRecoveryParamsFromUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    const hash = (urlObj.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const codeFromSearch = urlObj.searchParams.get('code');
    const codeFromHash = hashParams.get('code');
    return {
      access_token: hashParams.get('access_token'),
      refresh_token: hashParams.get('refresh_token'),
      code: codeFromSearch ?? codeFromHash,
    };
  } catch {
    return { access_token: null, refresh_token: null, code: null };
  }
};

const establishRecoverySessionFromParams = async (params: {
  access_token: string | null;
  refresh_token: string | null;
  code: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { access_token, refresh_token, code } = params;
  const hasPair = Boolean(access_token && refresh_token);
  const hasOneToken = Boolean(access_token || refresh_token);
  if (hasOneToken && !hasPair) {
    return { ok: false, error: 'Lien de réinitialisation incomplet (tokens manquants).' };
  }
  if (hasPair) {
    const { error } = await supabase.auth.setSession({ access_token: access_token!, refresh_token: refresh_token! });
    if (error) {
      return { ok: false, error: `Lien de réinitialisation invalide : ${error.message}` };
    }
    return { ok: true };
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { ok: false, error: `Lien de réinitialisation invalide : ${error.message}` };
    }
    return { ok: true };
  }
  return { ok: true };
};

const replaceWebPath = (path: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.history.replaceState(null, '', path);
  }
};

const readStoredOffers = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return [initialOffer];
  }
  const storedOffers = window.localStorage.getItem('allo-couscous-home-offers');
  const legacyOffer = window.localStorage.getItem('allo-couscous-home-offer');
  if (!storedOffers && !legacyOffer) {
    return [initialOffer];
  }
  try {
    const parsed = JSON.parse(storedOffers ?? legacyOffer ?? '[]');
    if (Array.isArray(parsed)) {
      return parsed.map((offer) => ({ ...initialOffer, ...offer })) as OfferConfig[];
    }
    return [{ ...initialOffer, ...parsed }] as OfferConfig[];
  } catch {
    return [initialOffer];
  }
};

const storeOffers = (offers: OfferConfig[]) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-home-offers', JSON.stringify(offers));
  }
};

const readStoredProducts = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return initialProducts;
  }
  const storedProducts = window.localStorage.getItem('allo-couscous-menu-products');
  if (!storedProducts) {
    return initialProducts;
  }
  try {
    const parsed = JSON.parse(storedProducts);
    return Array.isArray(parsed) && parsed.length ? (parsed as Product[]) : initialProducts;
  } catch {
    return initialProducts;
  }
};

const storeProducts = (products: Product[]) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-menu-products', JSON.stringify(products));
  }
};

const readStoredCategories = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return initialCategories;
  }
  const storedCategories = window.localStorage.getItem('allo-couscous-menu-categories');
  if (!storedCategories) {
    return initialCategories;
  }
  try {
    const parsed = JSON.parse(storedCategories);
    return Array.isArray(parsed) && parsed.length ? (parsed as Category[]) : initialCategories;
  } catch {
    return initialCategories;
  }
};

const storeCategories = (categories: Category[]) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-menu-categories', JSON.stringify(categories));
  }
};

const readStoredOrders = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return [];
  }
  const storedOrders = window.localStorage.getItem('allo-couscous-orders');
  if (!storedOrders) {
    return [];
  }
  try {
    const parsed = JSON.parse(storedOrders);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
};

const readPersistedOrders = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return [];
  }
  const storedOrders = window.localStorage.getItem('allo-couscous-orders');
  if (!storedOrders) {
    return [];
  }
  try {
    const parsed = JSON.parse(storedOrders);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
};

const storeOrders = (orders: Order[]) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-orders', JSON.stringify(orders));
  }
};

const readStoredCoupon = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return initialCoupon;
  }
  const storedCoupon = window.localStorage.getItem('allo-couscous-coupon');
  if (!storedCoupon) {
    return initialCoupon;
  }
  try {
    return { ...initialCoupon, ...JSON.parse(storedCoupon) } as CouponConfig;
  } catch {
    return initialCoupon;
  }
};

const storeCoupon = (coupon: CouponConfig) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-coupon', JSON.stringify(coupon));
  }
};

const readStoredLoyalty = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return initialLoyalty;
  }
  const storedLoyalty = window.localStorage.getItem('allo-couscous-loyalty');
  if (!storedLoyalty) {
    return initialLoyalty;
  }
  try {
    return { ...initialLoyalty, ...JSON.parse(storedLoyalty) } as LoyaltyState;
  } catch {
    return initialLoyalty;
  }
};

const storeLoyalty = (loyalty: LoyaltyState) => {
  const raw = JSON.stringify(loyalty);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-loyalty', raw);
    return;
  }
  void AsyncStorage.setItem('allo-couscous-loyalty', raw);
};

const readStoredProfile = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return initialProfile;
  }
  const storedProfile = window.localStorage.getItem('allo-couscous-profile');
  if (!storedProfile) {
    return initialProfile;
  }
  try {
    return { ...initialProfile, ...JSON.parse(storedProfile) } as ProfileData;
  } catch {
    return initialProfile;
  }
};

const storeProfile = (profile: ProfileData) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-profile', JSON.stringify(profile));
  }
};

const readStoredPushCampaigns = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return initialPushCampaigns;
  }
  const storedCampaigns = window.localStorage.getItem('allo-couscous-push-campaigns');
  if (!storedCampaigns) {
    return initialPushCampaigns;
  }
  try {
    const parsed = JSON.parse(storedCampaigns);
    return Array.isArray(parsed) ? (parsed as PushCampaign[]) : initialPushCampaigns;
  } catch {
    return initialPushCampaigns;
  }
};

const storePushCampaigns = (campaigns: PushCampaign[]) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-push-campaigns', JSON.stringify(campaigns));
  }
};

const readStoredOfferPushCampaigns = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return initialOfferPushCampaigns;
  }
  const raw = window.localStorage.getItem('allo-couscous-offer-push-campaigns');
  if (!raw) {
    return initialOfferPushCampaigns;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfferPushCampaign[]) : initialOfferPushCampaigns;
  } catch {
    return initialOfferPushCampaigns;
  }
};

const storeOfferPushCampaigns = (campaigns: OfferPushCampaign[]) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-offer-push-campaigns', JSON.stringify(campaigns));
  }
};

const readStoredRestaurants = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return restaurants;
  }
  const storedRestaurants = window.localStorage.getItem('allo-couscous-restaurants');
  if (!storedRestaurants) {
    return restaurants;
  }
  try {
    const parsed = JSON.parse(storedRestaurants);
    return Array.isArray(parsed) && parsed.length
      ? (parsed.map((restaurant) => {
        const mergedRestaurant = { ...getRestaurant(restaurant.id), ...restaurant } as Restaurant;
        return { ...mergedRestaurant, schedule: normalizeRestaurantSchedule(mergedRestaurant) };
      }) as Restaurant[])
      : restaurants;
  } catch {
    return restaurants;
  }
};

const storeRestaurants = (nextRestaurants: Restaurant[]) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('allo-couscous-restaurants', JSON.stringify(nextRestaurants));
  }
};

const CART_STORAGE_KEY = 'allo-couscous-cart-v1';

const serializeCartPayload = (restaurantId: string, cart: CartItem[]): SerializedCartPayload => ({
  restaurantId,
  items: cart.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
    extras: item.extras,
    note: item.note,
  })),
});

const hydrateCartFromPayload = (payload: SerializedCartPayload | null, products: Product[]): CartItem[] => {
  if (!payload?.items?.length) {
    return [];
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  const next: CartItem[] = [];
  for (const row of payload.items) {
    const product = byId.get(row.productId);
    if (!product) {
      continue;
    }
    next.push({
      product,
      quantity: Math.max(1, row.quantity),
      extras: Array.isArray(row.extras) ? row.extras : [],
      note: typeof row.note === 'string' ? row.note : '',
    });
  }
  return next;
};

const saveCartPayload = async (payload: SerializedCartPayload | null) => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (payload && payload.items.length) {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
      } else {
        window.localStorage.removeItem(CART_STORAGE_KEY);
      }
      return;
    }
    if (payload && payload.items.length) {
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
    } else {
      await AsyncStorage.removeItem(CART_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
};

const loadCartPayload = async (): Promise<SerializedCartPayload | null> => {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      raw = window.localStorage.getItem(CART_STORAGE_KEY);
    } else {
      raw = await AsyncStorage.getItem(CART_STORAGE_KEY);
    }
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SerializedCartPayload;
    if (!parsed?.restaurantId || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const mapSupabaseRestaurant = (restaurant: Record<string, any>): Restaurant => {
  const mappedRestaurant = {
    ...getRestaurant(restaurant.id),
    id: restaurant.id,
    name: restaurant.name,
    address: restaurant.address,
    phone: restaurant.phone,
    hours: restaurant.hours,
    schedule: Array.isArray(restaurant.schedule) ? restaurant.schedule : undefined,
    capacityPerSlot: Number(restaurant.capacity_per_slot ?? 4),
    acceptingOrders: restaurant.accepting_orders !== false,
    exceptionalClosedUntil: restaurant.exceptional_closed_until ?? '',
    archived: Boolean(restaurant.archived),
  };
  return { ...mappedRestaurant, schedule: normalizeRestaurantSchedule(mappedRestaurant) };
};

const mapSupabaseCategory = (category: Record<string, any>): Category => ({
  id: category.id,
  label: category.label,
  icon: '',
  description: category.description ?? '',
  restaurantIds: Array.isArray(category.restaurant_ids) ? category.restaurant_ids : [],
});

const mapSupabaseProduct = (product: Record<string, any>): Product => ({
  id: product.id,
  name: product.name,
  description: product.description ?? '',
  category: product.category,
  price: Number(product.price ?? 0),
  prepMinutes: Number(product.prep_minutes ?? 10),
  available: Boolean(product.available),
  image: product.image_url || tajineImage,
  extras: Array.isArray(product.extras) ? product.extras : [],
  restaurantIds: Array.isArray(product.restaurant_ids) ? product.restaurant_ids : [],
  labels: Array.isArray(product.labels) ? product.labels : [],
  allergens: Array.isArray(product.allergens) ? product.allergens : [],
});

const mapSupabaseOffer = (offer: Record<string, any>): OfferConfig => ({
  id: offer.id,
  title: offer.title,
  text: offer.body ?? '',
  image: offer.image_url || tajineImage,
  active: Boolean(offer.active),
});

const mapSupabaseCoupon = (coupon: Record<string, any>): CouponConfig => ({
  code: coupon.code,
  active: Boolean(coupon.active),
  type: coupon.type === 'fixed' ? 'fixed' : 'percent',
  value: Number(coupon.value ?? 0),
  minAmount: Number(coupon.min_amount ?? 0),
  used: Number(coupon.used ?? 0),
  maxUses: Number(coupon.max_uses ?? 1),
});

const mapSupabaseOrder = (order: Record<string, any>): Order => ({
  id: order.id,
  restaurantId: order.restaurant_id,
  createdAt: formatDateTimeForDisplay(order.created_at),
  pickupAt: formatDateTimeForDisplay(order.pickup_at),
  status: order.status as OrderStatus,
  total: Number(order.total ?? 0),
  items: Array.isArray(order.items) ? (order.items as CartItem[]) : [],
  userId: order.user_id ?? undefined,
  customerName: order.customer_name ?? '',
  customerPhone: order.customer_phone ?? '',
  customerEmail: order.customer_email ?? '',
  customerPostalAddress: order.customer_postal_address ?? '',
  couponCode: order.coupon_code ?? '',
  loyaltyDiscount: Number(order.loyalty_discount ?? 0),
  notifyWhenReady: order.notify_when_ready !== false,
  isPreorder: Boolean(order.is_preorder) || String(order.internal_note ?? '').toLowerCase().includes('précommande'),
  trackingToken: order.tracking_token ?? '',
  refusalReason: order.refusal_reason ?? (order.status === 'Annulée' ? order.internal_note ?? '' : ''),
  estimatedPrepMinutes: Number(order.estimated_prep_minutes ?? 0),
});

const mapSupabaseReview = (review: Record<string, any>): Review => ({
  id: review.id,
  orderId: review.order_id,
  userId: review.user_id ?? undefined,
  rating: Number(review.rating ?? 0),
  comment: review.comment ?? '',
  createdAt: formatDateTimeForDisplay(review.created_at),
});

const mapSupabasePushCampaign = (campaign: Record<string, any>): OfferPushCampaign => ({
  id: String(campaign.id),
  title: String(campaign.title ?? '').replace(/^\[Push\]\s*/i, ''),
  message: String(campaign.message ?? ''),
  audience: String(campaign.audience ?? 'Tous les clients'),
  createdAt: formatDateTimeForDisplay(campaign.created_at),
});

const productToSupabase = (product: Product) => ({
  id: product.id,
  name: product.name,
  description: product.description,
  category: product.category,
  price: product.price,
  prep_minutes: product.prepMinutes,
  available: product.available,
  image_url: product.image,
  extras: product.extras,
  restaurant_ids: product.restaurantIds ?? [],
  labels: product.labels ?? [],
  allergens: product.allergens ?? [],
});

const categoryToSupabase = (category: Category, index: number) => ({
  id: category.id,
  label: category.label,
  description: category.description,
  restaurant_ids: category.restaurantIds ?? [],
  display_order: (index + 1) * 10,
  active: true,
});

const offerToSupabase = (offer: OfferConfig) => ({
  id: offer.id,
  title: offer.title,
  body: offer.text,
  image_url: offer.image,
  active: offer.active,
});

const couponToSupabase = (coupon: CouponConfig) => ({
  code: coupon.code,
  active: coupon.active,
  type: coupon.type,
  value: coupon.value,
  min_amount: coupon.minAmount,
  used: coupon.used,
  max_uses: coupon.maxUses,
});

const restaurantToSupabase = (restaurant: Restaurant) => ({
  id: restaurant.id,
  name: restaurant.name,
  address: restaurant.address,
  phone: restaurant.phone,
  hours: restaurant.hours,
  schedule: normalizeRestaurantSchedule(restaurant),
  capacity_per_slot: restaurant.capacityPerSlot,
  accepting_orders: restaurant.acceptingOrders !== false,
  exceptional_closed_until: restaurant.exceptionalClosedUntil || null,
  archived: restaurant.archived === true,
});

const isProductAvailableForRestaurant = (product: Product, restaurantId: string) =>
  !product.restaurantIds?.length || product.restaurantIds.includes(restaurantId);

const isCategoryAvailableForRestaurant = (category: Category, restaurantId: string) =>
  !category.restaurantIds?.length || category.restaurantIds.includes(restaurantId);

const orderToSupabase = (order: Order) => ({
  id: order.id,
  user_id: order.userId ?? null,
  restaurant_id: order.restaurantId,
  customer_name: order.customerName ?? '',
  customer_phone: order.customerPhone ?? '',
  customer_email: order.customerEmail ?? '',
  customer_postal_address: order.customerPostalAddress ?? '',
  pickup_at: parsePickupAtToIso(order.pickupAt),
  status: order.status,
  total: order.total,
  coupon_code: order.couponCode || null,
  loyalty_discount: order.loyaltyDiscount ?? 0,
  payment_method: 'Paiement au retrait',
  notify_when_ready: order.notifyWhenReady !== false,
  is_preorder: Boolean(order.isPreorder),
  tracking_token: order.trackingToken ?? createTrackingToken(),
  internal_note: order.refusalReason || (order.isPreorder ? 'Précommande à valider par le restaurant' : ''),
  refusal_reason: order.refusalReason || null,
  estimated_prep_minutes: order.estimatedPrepMinutes ?? Math.max(...order.items.map((item) => item.product.prepMinutes), 10),
  items: order.items,
});

const showSupabaseAdminError = (error: unknown) => {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Action refusée par Supabase.';
  Alert.alert('Sauvegarde Supabase impossible', message);
};

const loadSupabaseBootstrap = async () => {
  if (!isSupabaseConfigured) {
    return null;
  }

  const [restaurantsResult, categoriesResult, productsResult, offersResult, couponsResult] = await Promise.all([
    supabase.from('restaurants').select('*').order('name', { ascending: true }),
    supabase.from('categories').select('*').order('display_order', { ascending: true }),
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('offers').select('*').order('created_at', { ascending: false }),
    supabase.from('coupons').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1),
  ]);

  if (restaurantsResult.error && categoriesResult.error && productsResult.error && offersResult.error && couponsResult.error) {
    return null;
  }

  return {
    restaurants: restaurantsResult.error ? [] : restaurantsResult.data?.map(mapSupabaseRestaurant) ?? [],
    categories: categoriesResult.error ? [] : categoriesResult.data?.map(mapSupabaseCategory) ?? [],
    products: productsResult.error ? [] : productsResult.data?.map(mapSupabaseProduct) ?? [],
    offers: offersResult.error ? [] : offersResult.data?.map(mapSupabaseOffer) ?? [],
    coupon: couponsResult.error ? null : couponsResult.data?.[0] ? mapSupabaseCoupon(couponsResult.data[0]) : null,
  };
};

class AppErrorBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: '' };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : 'Erreur inconnue au démarrage.' };
  }

  componentDidCatch(error: unknown) {
    console.warn('Erreur application capturée', error);
  }

  render() {
    if (this.state.message) {
      return (
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <View style={styles.crashScreen}>
            <Image source={clientLogo} style={styles.crashLogo} resizeMode="contain" />
            <Text style={styles.crashTitle}>Erreur au démarrage</Text>
            <Text style={styles.crashText}>{this.state.message}</Text>
            <Text style={styles.crashHint}>Envoyez cette capture pour identifier la cause exacte.</Text>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

function AlloApp() {
  const [screen, setScreen] = useState<Screen>(() => (isAdminWebRoute() ? 'admin' : 'welcome'));
  const [startupSplashVisible, setStartupSplashVisible] = useState(() => !isAdminWebRoute() && !isDownloadLandingRoute());
  const [nativePasswordResetVisible, setNativePasswordResetVisible] = useState(false);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(restaurants[0].id);
  const [selectedCategory, setSelectedCategory] = useState('Entrées');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [menuProducts, setMenuProductsState] = useState<Product[]>(readStoredProducts);
  const [menuCategories, setMenuCategoriesState] = useState<Category[]>(readStoredCategories);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrdersState] = useState<Order[]>(readStoredOrders);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [trackedOrder, setTrackedOrder] = useState<Order>(() => placeholderTrackedOrder());
  const [clientNotification, setClientNotification] = useState<ClientNotification | null>(null);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<string[]>([]);
  const [reviewModalOrder, setReviewModalOrder] = useState<Order | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const lastTrackedStatusRef = useRef(`${NO_TRACKED_ORDER_ID}:Terminée`);
  const cartRestoredRef = useRef(false);
  const skipCartPersistRef = useRef(true);
  const [addedCartItemName, setAddedCartItemName] = useState('');
  const [query, setQuery] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponConfig, setCouponConfigState] = useState<CouponConfig>(readStoredCoupon);
  const [loyalty, setLoyaltyState] = useState<LoyaltyState>(readStoredLoyalty);
  const [useLoyaltyReward, setUseLoyaltyReward] = useState(true);
  const [profile, setProfileState] = useState<ProfileData>(readStoredProfile);
  const [offers, setOffersState] = useState<OfferConfig[]>(readStoredOffers);
  const [pushCampaigns, setPushCampaignsState] = useState<PushCampaign[]>(readStoredPushCampaigns);
  const [offerPushCampaigns, setOfferPushCampaignsState] = useState<OfferPushCampaign[]>(readStoredOfferPushCampaigns);
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnostics | null>(null);
  const [restaurantSettings, setRestaurantSettingsState] = useState<Restaurant[]>(readStoredRestaurants);
  const [adminTab, setAdminTab] = useState<AdminTab>('Cuisine');
  const [adminSession, setAdminSession] = useState<any>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [adminAuthLoading, setAdminAuthLoading] = useState(isSupabaseConfigured);
  const liveRestaurants = restaurantSettings.map(getRestaurantStatus);
  const clientRestaurants = liveRestaurants.filter((restaurant) => !restaurant.archived);
  const selectedRestaurant = clientRestaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? clientRestaurants[0] ?? liveRestaurants[0] ?? getLiveRestaurant(selectedRestaurantId);
  const restaurantSettingsRef = useRef(restaurantSettings);
  restaurantSettingsRef.current = restaurantSettings;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const setOffers = (nextOffers: OfferConfig[]) => {
    setOffersState(nextOffers);
    storeOffers(nextOffers);
  };

  const setMenuProducts = (nextProducts: Product[]) => {
    setMenuProductsState(nextProducts);
    storeProducts(nextProducts);
  };

  const setMenuCategories = (nextCategories: Category[]) => {
    setMenuCategoriesState(nextCategories);
    storeCategories(nextCategories);
  };

  const setOrders = (nextOrders: StoredState<Order[]>) => {
    setOrdersState((current) => {
      const resolvedOrders = typeof nextOrders === 'function' ? nextOrders(current) : nextOrders;
      storeOrders(resolvedOrders);
      return resolvedOrders;
    });
  };

  const setCouponConfig = (nextCoupon: StoredState<CouponConfig>) => {
    setCouponConfigState((current) => {
      const resolvedCoupon = typeof nextCoupon === 'function' ? nextCoupon(current) : nextCoupon;
      storeCoupon(resolvedCoupon);
      return resolvedCoupon;
    });
  };

  const setLoyalty = (nextLoyalty: StoredState<LoyaltyState>) => {
    setLoyaltyState((current) => {
      const resolvedLoyalty = typeof nextLoyalty === 'function' ? nextLoyalty(current) : nextLoyalty;
      storeLoyalty(resolvedLoyalty);
      return resolvedLoyalty;
    });
  };

  const setProfile = (nextProfile: StoredState<ProfileData>) => {
    setProfileState((current) => {
      const resolvedProfile = typeof nextProfile === 'function' ? nextProfile(current) : nextProfile;
      storeProfile(resolvedProfile);
      return resolvedProfile;
    });
  };

  const setPushCampaigns = (nextCampaigns: PushCampaign[]) => {
    setPushCampaignsState(nextCampaigns);
    storePushCampaigns(nextCampaigns);
  };

  const setOfferPushCampaigns = (nextCampaigns: OfferPushCampaign[]) => {
    setOfferPushCampaignsState(nextCampaigns);
    storeOfferPushCampaigns(nextCampaigns);
  };

  const setRestaurantSettings = (nextRestaurants: Restaurant[]) => {
    setRestaurantSettingsState(nextRestaurants);
    storeRestaurants(nextRestaurants);
  };

  const loadAdminProfile = async (userId: string): Promise<AdminProfile | null> => {
    const { data, error } = await adminSupabase.from('profiles').select('id,email,role').eq('id', userId).single();
    if (error || !data || !canAccessAdmin((data as AdminProfile).role)) {
      setAdminProfile(null);
      return null;
    }
    const nextProfile = data as AdminProfile;
    setAdminProfile(nextProfile);
    return nextProfile;
  };

  const hydrateClientProfileFromSession = async () => {
    if (!isSupabaseConfigured) {
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return;
    }
    const { data, error, hasWelcomeEmailColumn } = await getCustomerProfileRow(session.user.id);
    if (error || !data || data.role !== 'customer') {
      return;
    }
    const firstName = (data.first_name ?? '').trim();
    const fullName = (data.full_name ?? '').trim();
    let nameRest = '';
    if (fullName) {
      if (firstName && fullName.toLowerCase().startsWith(firstName.toLowerCase())) {
        nameRest = fullName.slice(firstName.length).trim();
      } else {
        nameRest = fullName;
      }
    }
    const hydratedEmail = (data.email ?? session.user.email ?? profile.email).trim().toLowerCase();
    const hydratedProfile: WelcomeEmailPayload = {
      firstName: firstName || profile.firstName,
      name: nameRest || profile.name,
      email: hydratedEmail,
      phone: (data.phone ?? profile.phone).trim(),
      postalAddress: (data.postal_address ?? profile.postalAddress).trim(),
      preferredRestaurantId: data.preferred_restaurant_id ?? profile.preferredRestaurantId,
      marketingConsent: Boolean(data.marketing_consent),
      marketingPushConsent: Boolean(data.marketing_push_consent),
    };
    setProfileState((current) => {
      const merged: ProfileData = {
        ...current,
        userId: session.user.id,
        accountCreated: true,
        firstName: hydratedProfile.firstName || current.firstName,
        name: hydratedProfile.name || current.name,
        email: hydratedProfile.email || current.email,
        phone: hydratedProfile.phone || current.phone,
        postalAddress: hydratedProfile.postalAddress || current.postalAddress,
        preferredRestaurantId: hydratedProfile.preferredRestaurantId ?? current.preferredRestaurantId,
        marketingConsent: hydratedProfile.marketingConsent,
        marketingPushConsent: hydratedProfile.marketingPushConsent,
      };
      storeProfile(merged);
      return merged;
    });
    await loadLoyaltyFromServer(session.user.id);
    await loadCustomerOrdersFromSupabase(session.user.id);
    if (hasWelcomeEmailColumn && !data.welcome_email_sent_at) {
      await sendWelcomeEmailIfNeeded(session.user.id, hydratedProfile);
    }
  };

  const loadLoyaltyFromServer = async (userId?: string | null) => {
    if (!isSupabaseConfigured || !userId) {
      return;
    }
    const { data, error } = await supabase
      .from('loyalty_accounts')
      .select('points,total_spent,rewards_claimed,reward_credits')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('Fidélité', error.message);
      return;
    }
    if (!data) {
      return;
    }
    setLoyalty({
      points: data.points ?? 0,
      totalSpent: Number(data.total_spent ?? 0),
      rewardsClaimed: data.rewards_claimed ?? 0,
      rewardCredits: data.reward_credits ?? 0,
    });
  };

  const claimLoyaltyRewardRemote = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!isSupabaseConfigured) {
      return { ok: false, error: 'Supabase non configuré.' };
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      return { ok: false, error: 'Connecte-toi pour utiliser la fidélité.' };
    }
    const { data, error } = await supabase.rpc('claim_loyalty_reward', { p_threshold: rewardThreshold });
    if (error) {
      const msg = error.message.includes('points') ? 'Pas assez de points pour cette récompense.' : error.message;
      return { ok: false, error: msg };
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const row = data as Record<string, unknown>;
      setLoyalty({
        points: Number(row.points ?? 0),
        totalSpent: Number(row.total_spent ?? 0),
        rewardsClaimed: Number(row.rewards_claimed ?? 0),
        rewardCredits: Number(row.reward_credits ?? 0),
      });
      return { ok: true };
    }
    await loadLoyaltyFromServer(uid);
    return { ok: true };
  };

  const requestPasswordReset = async (email: string): Promise<{ ok: boolean; error?: string }> => {
    if (!isSupabaseConfigured) {
      return { ok: false, error: 'Supabase non configuré.' };
    }
    const clean = email.trim().toLowerCase();
    if (!clean) {
      return { ok: false, error: 'Indique ton adresse email.' };
    }
    const redirectTo = getPasswordResetRedirectUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(clean, redirectTo ? { redirectTo } : undefined);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  };

  const completePasswordReset = async (newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    if (!isSupabaseConfigured) {
      return { ok: false, error: 'Supabase non configuré.' };
    }
    if (newPassword.length < 6) {
      return { ok: false, error: 'Utilise au minimum 6 caractères pour le nouveau mot de passe.' };
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const queryParams = new URLSearchParams(window.location.search.replace(/^\?/, ''));
      const sessionResult = await establishRecoverySessionFromParams({
        access_token: hashParams.get('access_token'),
        refresh_token: hashParams.get('refresh_token'),
        code: queryParams.get('code'),
      });
      if (!sessionResult.ok) {
        return { ok: false, error: sessionResult.error };
      }
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return {
        ok: false,
        error: 'Lien expiré ou déjà utilisé. Redemande un lien “Mot de passe oublié” depuis l’application.',
      };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false, error: error.message };
    }
    await supabase.auth.signOut();
    setProfile((current) => ({
      ...current,
      userId: undefined,
      accountCreated: false,
      email: session.user.email ?? current.email,
    }));
    setOrders([]);
    setTrackedOrder(placeholderTrackedOrder());
    return { ok: true };
  };

  const loadReviewedOrderIds = async () => {
    if (!isSupabaseConfigured) {
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      setReviewedOrderIds([]);
      return;
    }
    const { data, error } = await supabase.from('reviews').select('order_id').eq('user_id', uid);
    if (error) {
      console.warn('Avis', error.message);
      return;
    }
    setReviewedOrderIds((data ?? []).map((row) => String((row as { order_id: string }).order_id)));
  };

  const submitOrderReview = async (order: Order, rating: number, comment: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase non configuré.');
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      throw new Error('Connexion requise.');
    }
    const { error } = await supabase.from('reviews').insert({
      order_id: order.id,
      user_id: uid,
      rating,
      comment: comment.trim(),
    });
    if (error) {
      throw new Error(error.message);
    }
    setReviewedOrderIds((current) => [...current, order.id]);
  };

  const syncMarketingPushDevice = async (p: ProfileData) => {
    if (!isSupabaseConfigured || !p.userId) {
      return { ok: false, reason: 'Compte client non connecté.' };
    }
    if (!p.marketingPushConsent) {
      await supabase.from('marketing_push_tokens').delete().eq('user_id', p.userId);
      return { ok: true };
    }
    if (Platform.OS === 'web' || !p.accountCreated) {
      return { ok: false, reason: 'Les notifications push sont disponibles uniquement dans l’application mobile installée.' };
    }
    try {
      const tokenResult = await getMobileExpoPushTokenResult();
      if (!tokenResult.token) {
        return { ok: false, reason: tokenResult.reason ?? 'Token push indisponible.' };
      }
      const { error } = await supabase.from('marketing_push_tokens').upsert(
        {
          user_id: p.userId,
          token: tokenResult.token,
          platform: Platform.OS,
          enabled: true,
        },
        { onConflict: 'user_id,token' },
      );
      if (error) {
        console.warn('Jeton push offres non enregistré', error.message);
        return { ok: false, reason: error.message };
      }
      return { ok: true };
    } catch (err) {
      console.warn('Notifications push offres', err);
      const reason = err instanceof Error ? err.message : 'Erreur inconnue pendant l’activation des notifications.';
      return { ok: false, reason };
    }
  };

  const signInAdmin = async (email: string, password: string) => {
    const { data, error } = await adminSupabase.auth.signInWithPassword({ email, password });
    if (error) {
      Alert.alert('Connexion refusée', `Motif : ${getAuthRefusalReason(error.message)}`);
      return;
    }
    const nextProfile = data.user ? await loadAdminProfile(data.user.id) : null;
    if (!nextProfile) {
      await adminSupabase.auth.signOut();
      setAdminSession(null);
      setAdminProfile(null);
      Alert.alert('Connexion refusée', 'Motif : ce compte n’a pas accès à l’administration.');
      return;
    }
    setAdminSession(data.session);
  };

  const signOutAdmin = async () => {
    await adminSupabase.auth.signOut();
    setAdminSession(null);
    setAdminProfile(null);
  };

  const getCustomerProfileRow = async (
    userId: string,
  ): Promise<{ data: CustomerProfileRow | null; error: { message: string } | null; hasWelcomeEmailColumn: boolean }> => {
    const query = supabase.from('profiles').select(customerProfileSelectWithWelcome).eq('id', userId).maybeSingle();
    const { data, error } = await query;
    if (!error) {
      return { data: data as CustomerProfileRow | null, error: null, hasWelcomeEmailColumn: true };
    }
    if (error.message?.toLowerCase().includes('welcome_email_sent_at')) {
      const fallback = await supabase.from('profiles').select(customerProfileSelectBase).eq('id', userId).maybeSingle();
      return {
        data: fallback.data as CustomerProfileRow | null,
        error: fallback.error ? { message: fallback.error.message } : null,
        hasWelcomeEmailColumn: false,
      };
    }
    return { data: null, error: { message: error.message }, hasWelcomeEmailColumn: true };
  };

  const signInCustomer = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase requis', 'La connexion client nécessite Supabase.');
      return false;
    }
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) {
      Alert.alert('Connexion refusée', `Motif : ${getAuthRefusalReason(error.message)}`);
      return false;
    }
    if (!data.user) {
      Alert.alert('Connexion refusée', 'Motif : aucun utilisateur client trouvé.');
      return false;
    }
    const { data: profileRow, error: profileError, hasWelcomeEmailColumn } = await getCustomerProfileRow(data.user.id);
    if (profileError) {
      Alert.alert('Connexion refusée', `Motif : profil client introuvable ou inaccessible (${profileError.message}).`);
      return false;
    }
    if (profileRow && profileRow.role !== 'customer') {
      await supabase.auth.signOut();
      Alert.alert('Connexion refusée', 'Motif : ce compte est réservé à l’administration.');
      return false;
    }
    let nextRow: CustomerProfileRow | null = profileRow;
    if (!nextRow) {
      const profilePayload = {
        id: data.user.id,
        email: cleanEmail,
        first_name: profile.firstName.trim(),
        full_name: getProfileDisplayName(profile),
        phone: profile.phone.trim(),
        postal_address: profile.postalAddress.trim(),
        preferred_restaurant_id: profile.preferredRestaurantId,
        marketing_consent: profile.marketingConsent,
        marketing_push_consent: profile.marketingPushConsent,
        role: 'customer',
      };
      const { data: insertedProfile, error: insertError } = await supabase
        .from('profiles')
        .upsert(profilePayload)
        .select(hasWelcomeEmailColumn ? customerProfileSelectWithWelcome : customerProfileSelectBase)
        .single();
      if (insertError) {
        Alert.alert('Connexion refusée', `Motif : le profil client n’a pas pu être créé (${insertError.message}).`);
        return false;
      }
      nextRow = insertedProfile as unknown as CustomerProfileRow | null;
    }
    if (!nextRow) {
      Alert.alert('Connexion refusée', 'Motif : le profil client n’a pas pu être chargé.');
      return false;
    }
    const firstName = (nextRow.first_name ?? '').trim();
    const fullName = (nextRow.full_name ?? '').trim();
    const lastName = firstName && fullName.toLowerCase().startsWith(firstName.toLowerCase())
      ? fullName.slice(firstName.length).trim()
      : fullName;
    setProfile((current) => ({
      ...current,
      userId: data.user.id,
      accountCreated: true,
      firstName: firstName || current.firstName,
      name: lastName || current.name,
      email: (nextRow.email ?? data.user.email ?? cleanEmail).trim().toLowerCase(),
      phone: (nextRow.phone ?? current.phone).trim(),
      postalAddress: (nextRow.postal_address ?? current.postalAddress).trim(),
      preferredRestaurantId: nextRow.preferred_restaurant_id ?? current.preferredRestaurantId,
      marketingConsent: Boolean(nextRow.marketing_consent),
      marketingPushConsent: Boolean(nextRow.marketing_push_consent),
    }));
    setOrders([]);
    await loadLoyaltyFromServer(data.user.id);
    await loadCustomerOrdersFromSupabase(data.user.id);
    if (hasWelcomeEmailColumn && !nextRow.welcome_email_sent_at) {
      await sendWelcomeEmailIfNeeded(data.user.id, {
        firstName: firstName || profile.firstName,
        name: lastName || profile.name,
        email: (nextRow.email ?? data.user.email ?? cleanEmail).trim().toLowerCase(),
        phone: (nextRow.phone ?? profile.phone).trim(),
        postalAddress: (nextRow.postal_address ?? profile.postalAddress).trim(),
        preferredRestaurantId: nextRow.preferred_restaurant_id ?? profile.preferredRestaurantId,
        marketingConsent: Boolean(nextRow.marketing_consent),
        marketingPushConsent: Boolean(nextRow.marketing_push_consent),
      });
    }
    Alert.alert('Connecté', 'Votre compte client est connecté.');
    return true;
  };

  const applyClientAuthClearedState = (ordersMode: 'empty' | 'guestOnlyWeb') => {
    setCart([]);
    void saveCartPayload(null);
    setLoyalty(initialLoyalty);
    setReviewedOrderIds([]);
    setReviewModalOrder(null);
    setProfile((current) => ({
      ...initialProfile,
      preferredRestaurantId: current.preferredRestaurantId,
      phone: '',
      postalAddress: '',
      email: '',
      name: '',
      firstName: '',
      marketingConsent: false,
      marketingPushConsent: false,
    }));
    if (ordersMode === 'empty') {
      setOrders([]);
    } else {
      const guestOnly =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? readPersistedOrders().filter((order) => !order.userId)
          : [];
      setOrders(guestOnly);
    }
    setTrackedOrder(placeholderTrackedOrder());
    lastTrackedStatusRef.current = `${NO_TRACKED_ORDER_ID}:Terminée`;
  };

  const signOutCustomer = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    applyClientAuthClearedState('empty');
    Alert.alert('Déconnecté', 'Le compte client est déconnecté de cet appareil.');
  };

  const sendWelcomeEmail = async (payload: WelcomeEmailPayload) => {
    if (!isSupabaseConfigured) {
      return false;
    }
    const { error } = await supabase.functions.invoke('send-welcome-email', {
      body: {
        customer: {
          firstName: payload.firstName,
          name: `${payload.firstName} ${payload.name}`.trim(),
          email: payload.email,
          preferredRestaurant: getRestaurant(payload.preferredRestaurantId).name,
          marketingConsent: payload.marketingConsent,
        },
      },
    });
    if (error) {
      console.warn('Email de bienvenue non envoyé', error.message);
      return false;
    }
    return true;
  };

  const sendWelcomeEmailIfNeeded = async (userId: string, payload: WelcomeEmailPayload) => {
    if (!isSupabaseConfigured || !userId || !payload.email.trim()) {
      return;
    }
    const sent = await sendWelcomeEmail(payload);
    if (!sent) {
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', userId)
      .is('welcome_email_sent_at', null);
    if (error) {
      console.warn('Marqueur email de bienvenue non enregistré', error.message);
    }
  };

  const mapSignUpErrorMessage = (message: string) => {
    const m = message.toLowerCase();
    if (m.includes('sending confirmation email') || m.includes('confirmation email')) {
      return 'Supabase essaie d’envoyer un email de confirmation. Pour cette V1, désactive la confirmation email dans Supabase Auth : l’app envoie déjà son email de bienvenue.';
    }
    if (m.includes('already') && (m.includes('registered') || m.includes('exists'))) {
      return 'Cette adresse email est déjà utilisée. Connecte-toi, ou vérifie tes emails (lien de confirmation ou mot de passe oublié).';
    }
    if (m.includes('password') && m.includes('least')) {
      return 'Le mot de passe ne respecte pas les règles du service (longueur ou complexité).';
    }
    if (m.includes('rate limit') || m.includes('email rate limit')) {
      return 'Trop d’emails de confirmation ont été demandés en peu de temps. Attends une quinzaine de minutes, vérifie tes spams, puis réessaie sans cliquer plusieurs fois sur « Créer mon compte ».';
    }
    return message;
  };

  const createCustomerAccount = async (payload: CustomerAccountPayload): Promise<CustomerAccountCreateResult> => {
    if (!isSupabaseConfigured) {
      return { ok: false, error: 'La création de compte nécessite une configuration Supabase (contacte le restaurant si le problème persiste).' };
    }
    const cleanEmail = payload.email.trim().toLowerCase();
    const rawDomain = process.env.EXPO_PUBLIC_APP_DOMAIN?.trim();
    const emailRedirectTo =
      rawDomain && rawDomain.length > 0
        ? /^https?:\/\//i.test(rawDomain)
          ? rawDomain.replace(/\/$/, '')
          : `https://${rawDomain.replace(/\/$/, '')}`
        : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: payload.password,
      options: {
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
        data: {
          first_name: payload.firstName.trim(),
          full_name: `${payload.firstName.trim()} ${payload.name.trim()}`.trim(),
          phone: payload.phone.trim(),
          postal_address: payload.postalAddress.trim(),
          preferred_restaurant_id: payload.preferredRestaurantId,
          marketing_consent: payload.marketingConsent,
          marketing_push_consent: payload.marketingPushConsent,
        },
      },
    });
    if (error) {
      return { ok: false, error: mapSignUpErrorMessage(error.message) };
    }
    if (!data.user) {
      return {
        ok: false,
        error:
          'Si une inscription est en cours, ouvre le message de confirmation dans tes emails. Sinon réessaie ou connecte-toi avec cette adresse.',
      };
    }
    const createdUser = data.user;
    const identities = createdUser.identities;
    const explicitEmptyIdentities = Array.isArray(identities) && identities.length === 0;
    if (!data.session && explicitEmptyIdentities) {
      return {
        ok: false,
        error:
          'Cette adresse est déjà enregistrée ou un lien de confirmation a déjà été envoyé. Vérifie ta boîte mail (et les indésirables), ou connecte-toi. Une seule inscription par email.',
      };
    }
    if (!data.session) {
      return {
        ok: false,
        error:
          'Le compte a été créé côté Supabase, mais il n’est pas connecté automatiquement car la confirmation email est active. Désactive “Confirm email” dans Supabase Auth pour cette V1, puis recrée ou confirme ce compte.',
      };
    }
    const profilePayload = {
      id: createdUser.id,
      email: cleanEmail,
      first_name: payload.firstName.trim(),
      full_name: `${payload.firstName.trim()} ${payload.name.trim()}`.trim(),
      phone: payload.phone.trim(),
      postal_address: payload.postalAddress.trim(),
      preferred_restaurant_id: payload.preferredRestaurantId,
      marketing_consent: payload.marketingConsent,
      marketing_push_consent: payload.marketingPushConsent,
      role: 'customer',
    };
    const { error: profileError } = await supabase.from('profiles').upsert(profilePayload);
    if (profileError) {
      if (profileError.message?.includes('first_name')) {
        const { first_name: _firstName, ...fallbackProfilePayload } = profilePayload;
        const retry = await supabase.from('profiles').upsert(fallbackProfilePayload);
        if (retry.error) {
          console.warn('profiles upsert', retry.error);
          return { ok: false, error: 'Impossible d’enregistrer ton profil. Réessaie dans quelques instants.' };
        }
      } else if (profileError.message?.includes('marketing_push_consent')) {
        const { marketing_push_consent: _m, ...fallbackProfilePayload } = profilePayload;
        const retry = await supabase.from('profiles').upsert(fallbackProfilePayload);
        if (retry.error) {
          console.warn('profiles upsert', retry.error);
          return { ok: false, error: 'Impossible d’enregistrer ton profil. Réessaie dans quelques instants.' };
        }
      } else {
        console.warn('profiles upsert', profileError);
        return { ok: false, error: 'Impossible d’enregistrer ton profil. Réessaie dans quelques instants.' };
      }
    }
    await sendWelcomeEmailIfNeeded(createdUser.id, { ...payload, email: cleanEmail });
    setProfile((current) => ({
      ...current,
      userId: createdUser.id,
      firstName: payload.firstName.trim(),
      name: payload.name.trim(),
      email: cleanEmail,
      phone: payload.phone.trim(),
      postalAddress: payload.postalAddress.trim(),
      preferredRestaurantId: payload.preferredRestaurantId,
      marketingConsent: payload.marketingConsent,
      marketingPushConsent: payload.marketingPushConsent,
      accountCreated: true,
    }));
    setOrders([]);
    await loadLoyaltyFromServer(createdUser.id);
    await loadCustomerOrdersFromSupabase(createdUser.id);
    return { ok: true, successMessage: 'Compte créé. Un email de bienvenue vient de t’être envoyé.' };
  };

  const saveCustomerProfile = async (nextProfile: ProfileData) => {
    setProfile(nextProfile);
    if (isSupabaseConfigured && nextProfile.userId) {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: nextProfile.firstName.trim(),
          full_name: getProfileDisplayName(nextProfile),
          email: nextProfile.email.trim().toLowerCase(),
          phone: nextProfile.phone.trim(),
          postal_address: nextProfile.postalAddress.trim(),
          preferred_restaurant_id: nextProfile.preferredRestaurantId,
          marketing_consent: nextProfile.marketingConsent,
          marketing_push_consent: nextProfile.marketingPushConsent,
        })
        .eq('id', nextProfile.userId);
      if (error) {
        if (error.message?.includes('first_name')) {
          const retry = await supabase
            .from('profiles')
            .update({
              full_name: getProfileDisplayName(nextProfile),
              email: nextProfile.email.trim().toLowerCase(),
              phone: nextProfile.phone.trim(),
              postal_address: nextProfile.postalAddress.trim(),
              preferred_restaurant_id: nextProfile.preferredRestaurantId,
              marketing_consent: nextProfile.marketingConsent,
              marketing_push_consent: nextProfile.marketingPushConsent,
            })
            .eq('id', nextProfile.userId);
          if (retry.error) {
            showSupabaseAdminError(retry.error);
            return false;
          }
        } else if (error.message?.includes('marketing_push_consent')) {
          const retry = await supabase
            .from('profiles')
            .update({
              first_name: nextProfile.firstName.trim(),
              full_name: getProfileDisplayName(nextProfile),
              email: nextProfile.email.trim().toLowerCase(),
              phone: nextProfile.phone.trim(),
              postal_address: nextProfile.postalAddress.trim(),
              preferred_restaurant_id: nextProfile.preferredRestaurantId,
              marketing_consent: nextProfile.marketingConsent,
            })
            .eq('id', nextProfile.userId);
          if (retry.error) {
            showSupabaseAdminError(retry.error);
            return false;
          }
        } else {
          showSupabaseAdminError(error);
          return false;
        }
      }
      if (!nextProfile.marketingPushConsent && nextProfile.userId) {
        await supabase.from('marketing_push_tokens').delete().eq('user_id', nextProfile.userId);
      }
      if (nextProfile.marketingPushConsent && nextProfile.userId) {
        const pushSync = await syncMarketingPushDevice(nextProfile);
        if (!pushSync.ok && Platform.OS !== 'web') {
          Alert.alert('Notifications non activées', pushSync.reason ?? 'Le téléphone n’a pas pu être enregistré pour les notifications push.');
        }
      }
    }
    return true;
  };

  const deleteCustomerAccount = async () => {
    if (!profile.accountCreated) {
      Alert.alert('Aucun compte', 'Aucun compte client n’est associé à ce profil.');
      return false;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase requis', 'La suppression du compte nécessite Supabase.');
      return false;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      Alert.alert('Connexion requise', 'Reconnecte-toi au compte client avant de le supprimer.');
      return false;
    }
    const { error } = await supabase.functions.invoke('delete-customer-account', {
      body: {},
    });
    if (error) {
      Alert.alert('Suppression impossible', error.message);
      return false;
    }
    await supabase.auth.signOut();
    setProfile({
      ...initialProfile,
      preferredRestaurantId: profile.preferredRestaurantId,
      phone: '',
      postalAddress: '',
      email: '',
      name: '',
      firstName: '',
      marketingConsent: false,
      marketingPushConsent: false,
    });
    Alert.alert('Compte supprimé', 'Le compte client et ses données associées ont été supprimés.');
    return true;
  };

  const sendMarketingEmail = async (campaign: PushCampaign) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase requis', 'L’envoi email publicitaire nécessite Supabase.');
      return false;
    }
    const { error } = await adminSupabase.functions.invoke('send-marketing-email', {
      body: campaign,
    });
    if (error) {
      Alert.alert('Email non envoyé', error.message);
      return false;
    }
    return true;
  };

  const sendMarketingPushCampaign = async (campaign: OfferPushCampaign): Promise<CampaignSendResult> => {
    if (!isSupabaseConfigured) {
      return { ok: false, message: 'L’envoi push offres nécessite Supabase.' };
    }
    const { data, error } = await adminSupabase.functions.invoke<{
      ok?: boolean;
      sent?: number;
      tokens?: number;
      error?: string;
      errors?: string[];
    }>('send-marketing-push', {
      body: campaign,
    });
    if (error) {
      return { ok: false, message: `Supabase a refusé l’envoi : ${error.message}` };
    }
    if (data?.error) {
      return { ok: false, message: `La fonction push a répondu : ${data.error}` };
    }
    const tokenCount = data?.tokens ?? 0;
    const sentCount = data?.sent ?? 0;
    if (tokenCount === 0) {
      return {
        ok: false,
        message:
          'Aucun téléphone enregistré pour cette cible. Installe le dernier build, connecte un compte client, coche les notifications push offres dans Profil, puis appuie sur Enregistrer.',
      };
    }
    if (sentCount === 0) {
      const expoError = data?.errors?.length ? ` Erreur Expo : ${data.errors.join(', ')}` : '';
      return {
        ok: false,
        message: `${tokenCount} téléphone(s) ciblé(s), mais Expo n’a accepté aucun envoi.${expoError}`,
      };
    }
    const partialDetail =
      sentCount < tokenCount && data?.errors?.length
        ? ` Détail Expo (échecs) : ${data.errors.join('; ')}`
        : sentCount < tokenCount
          ? ' Un ou plusieurs appareils n’ont pas reçu la notif (vérifie les réglages Android, la batterie / données, et ré-enregistre le jeton : Profil → notifications push offres → Enregistrer, puis rouvre l’app).'
          : '';
    return {
      ok: true,
      message: `Push offres envoyé : ${sentCount}/${tokenCount} téléphone(s) ciblé(s).${partialDetail}`,
    };
  };

  const upsertProduct = async (product: Product) => {
    const { error } = await adminSupabase.from('products').upsert(productToSupabase(product));
    if (error) throw error;
  };

  const deleteProduct = async (productId: string) => {
    const { error } = await adminSupabase.from('products').delete().eq('id', productId);
    if (error) throw error;
  };

  const upsertCategory = async (category: Category, index: number) => {
    const { error } = await adminSupabase.from('categories').upsert(categoryToSupabase(category, index));
    if (error) throw error;
  };

  const deleteCategoryRemote = async (categoryId: string) => {
    const { error } = await adminSupabase.from('categories').delete().eq('id', categoryId);
    if (error) throw error;
  };

  const upsertOffer = async (offer: OfferConfig) => {
    const { error } = await adminSupabase.from('offers').upsert(offerToSupabase(offer));
    if (error) throw error;
  };

  const deleteOffer = async (offerId: string) => {
    const { error } = await adminSupabase.from('offers').delete().eq('id', offerId);
    if (error) throw error;
  };

  const upsertCoupon = async (nextCoupon: CouponConfig) => {
    const { error } = await adminSupabase.from('coupons').upsert(couponToSupabase(nextCoupon), { onConflict: 'code' });
    if (error) throw error;
  };

  const upsertRestaurant = async (restaurant: Restaurant) => {
    const payload = restaurantToSupabase(restaurant);
    const { error } = await adminSupabase.from('restaurants').upsert(payload);
    if (!error) return;
    const message = error.message.toLowerCase();
    if (message.includes('schedule')) {
      throw new Error('La colonne schedule manque ou le cache Supabase n’est pas à jour. Relance le SQL puis réessaie la sauvegarde des horaires.');
    }
    if (message.includes('archived') || message.includes('schema cache')) {
      const fallbackPayload = { ...payload };
      delete (fallbackPayload as Record<string, unknown>).archived;
      const retry = await adminSupabase.from('restaurants').upsert(fallbackPayload);
      if (retry.error) throw retry.error;
      return;
    }
    if (error) throw error;
  };

  const updateOrderStatusRemote = async (orderId: string, status: OrderStatus, updates: Partial<Order> = {}) => {
    const payload: Record<string, string | number> = { status };
    if (updates.refusalReason !== undefined) {
      const refusalReason = updates.refusalReason || '';
      payload.internal_note = refusalReason;
      payload.refusal_reason = refusalReason;
    }
    if (updates.estimatedPrepMinutes !== undefined) {
      payload.estimated_prep_minutes = updates.estimatedPrepMinutes;
    }
    const sendPush = async () => {
      if (!['Acceptée', 'Annulée', 'Prête'].includes(status)) {
        return;
      }
      const { error: pushError } = await adminSupabase.functions.invoke('send-order-push', {
        body: {
          orderId,
          status,
          refusalReason: updates.refusalReason ?? '',
        },
      });
      if (pushError) {
        console.warn('Notification push non envoyée', pushError.message);
      }
    };
    const { error } = await adminSupabase.from('orders').update(payload).eq('id', orderId);
    if (!error) {
      await sendPush();
      return;
    }
    const message = error.message.toLowerCase();
    if (message.includes('refusal_reason') || message.includes('estimated_prep_minutes') || message.includes('schema cache')) {
      const fallbackPayload: Record<string, string | number> = { status };
      if (updates.refusalReason !== undefined) {
        fallbackPayload.internal_note = updates.refusalReason || '';
      }
      const retry = await adminSupabase.from('orders').update(fallbackPayload).eq('id', orderId);
      if (retry.error) throw retry.error;
      await sendPush();
      return;
    }
    throw error;
  };

  const cancelCustomerOrderRemote = async (order: Order) => {
    if (!order.trackingToken) {
      throw new Error('Token de suivi manquant.');
    }
    const { data, error } = await supabase.rpc('cancel_customer_order', {
      p_order_id: order.id,
      p_tracking_token: order.trackingToken,
    });
    if (error) {
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error('Cette commande a déjà été acceptée ou ne peut plus être annulée.');
    }
    return mapSupabaseOrder(row);
  };

  const createOrderRemote = async (order: Order) => {
    const payload = orderToSupabase(order);
    const { error } = await supabase.from('orders').insert(payload);
    if (!error) {
      return;
    }
    const message = error.message.toLowerCase();
    if (message.includes('is_preorder') || message.includes('refusal_reason') || message.includes('estimated_prep_minutes') || message.includes('tracking_token') || message.includes('schema cache')) {
      const fallbackPayload = { ...payload };
      if (message.includes('is_preorder')) {
        delete (fallbackPayload as Record<string, unknown>).is_preorder;
      }
      if (message.includes('tracking_token')) {
        delete (fallbackPayload as Record<string, unknown>).tracking_token;
      }
      if (message.includes('refusal_reason')) {
        delete (fallbackPayload as Record<string, unknown>).refusal_reason;
      }
      if (message.includes('estimated_prep_minutes')) {
        delete (fallbackPayload as Record<string, unknown>).estimated_prep_minutes;
      }
      const retry = await supabase.from('orders').insert(fallbackPayload);
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  };

  const registerOrderPushToken = async (order: Order) => {
    if (!isSupabaseConfigured || Platform.OS === 'web') {
      return;
    }
    try {
      const token = await getMobileExpoPushToken();
      if (!token) {
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = order.userId ?? profile.userId ?? sessionData.session?.user?.id;
      if (!userId) {
        console.warn('Token push non enregistré : utilisateur non identifié');
        return;
      }
      const { error } = await supabase.from('push_tokens').upsert(
        {
          token,
          user_id: userId,
          order_id: order.id,
          restaurant_id: order.restaurantId,
          customer_email: order.customerEmail ?? '',
          platform: Platform.OS,
          enabled: true,
        },
        { onConflict: 'token,order_id' },
      );
      if (error) {
        console.warn('Token push non enregistré', error.message);
      }
    } catch (error) {
      console.warn('Notifications push non activées', error);
    }
  };

  const cancelTrackedOrder = async () => {
    if (trackedOrder.status !== 'Nouvelle') {
      Alert.alert('Annulation impossible', 'La commande a déjà été acceptée par le restaurant.');
      return;
    }
    const cancelledOrder: Order = {
      ...trackedOrder,
      status: 'Annulée',
      refusalReason: 'Commande annulée par le client',
    };
    setTrackedOrder(cancelledOrder);
    setOrders((current) => current.map((order) => (order.id === cancelledOrder.id ? cancelledOrder : order)));
    if (!isSupabaseConfigured) {
      return;
    }
    try {
      const remoteOrder = await cancelCustomerOrderRemote(trackedOrder);
      const nextOrder = {
        ...remoteOrder,
        trackingToken: trackedOrder.trackingToken || remoteOrder.trackingToken,
      };
      setTrackedOrder(nextOrder);
      setOrders((current) => current.map((order) => (order.id === nextOrder.id ? { ...order, ...nextOrder } : order)));
    } catch (error) {
      Alert.alert('Annulation non confirmée', error instanceof Error ? error.message : 'La commande ne peut plus être annulée.');
      const remoteOrder = await loadTrackedOrder(trackedOrder);
      if (remoteOrder) {
        setTrackedOrder({ ...remoteOrder, trackingToken: trackedOrder.trackingToken || remoteOrder.trackingToken });
      }
    }
  };

  const requestCancelTrackedOrder = () => {
    const confirmCancel = () => void cancelTrackedOrder();
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Annuler cette commande ? Cette action est possible uniquement avant validation par le restaurant.')) {
        confirmCancel();
      }
      return;
    }
    Alert.alert(
      'Annuler la commande ?',
      'Cette action est possible uniquement avant validation par le restaurant.',
      [
        { text: 'Garder la commande', style: 'cancel' },
        { text: 'Annuler ma commande', style: 'destructive', onPress: confirmCancel },
      ],
    );
  };

  const loadSupabaseOrders = async (silent = false) => {
    if (!isSupabaseConfigured) {
      return;
    }
    const { data, error } = await adminSupabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) {
      if (!silent) {
        showSupabaseAdminError(error);
      }
      return;
    }
    const remoteOrders = data?.map(mapSupabaseOrder) ?? [];
    const localOrders = readPersistedOrders();
    const nextOrders = [
      ...remoteOrders,
      ...localOrders.filter((localOrder) => !remoteOrders.some((remoteOrder) => remoteOrder.id === localOrder.id)),
    ];
    setOrders(nextOrders);
  };

  const loadSupabaseReviews = async (silent = false) => {
    if (!isSupabaseConfigured) {
      return;
    }
    const { data, error } = await adminSupabase.from('reviews').select('*').order('created_at', { ascending: false });
    if (error) {
      if (!silent) {
        showSupabaseAdminError(error);
      }
      return;
    }
    setReviews(data?.map(mapSupabaseReview) ?? []);
  };

  const loadSupabasePushCampaigns = async (silent = false) => {
    if (!isSupabaseConfigured) {
      return;
    }
    const { data, error } = await adminSupabase.from('push_campaigns').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) {
      if (!silent) {
        showSupabaseAdminError(error);
      }
      return;
    }
    setOfferPushCampaigns(data?.map(mapSupabasePushCampaign) ?? []);
  };

  const loadPushDiagnostics = async (silent = false) => {
    if (!isSupabaseConfigured) {
      return;
    }
    const [consents, tokens, enabledTokens] = await Promise.all([
      adminSupabase.from('profiles').select('id', { count: 'exact', head: true }).eq('marketing_push_consent', true),
      adminSupabase.from('marketing_push_tokens').select('id', { count: 'exact', head: true }),
      adminSupabase.from('marketing_push_tokens').select('id', { count: 'exact', head: true }).eq('enabled', true),
    ]);
    const firstError = consents.error ?? tokens.error ?? enabledTokens.error;
    if (firstError) {
      if (!silent) {
        showSupabaseAdminError(firstError);
      }
      setPushDiagnostics({
        consentingProfiles: 0,
        marketingTokens: 0,
        enabledMarketingTokens: 0,
        lastCheckedAt: formatDateTimeForDisplay(new Date().toISOString()),
        error: firstError.message,
      });
      return;
    }
    setPushDiagnostics({
      consentingProfiles: consents.count ?? 0,
      marketingTokens: tokens.count ?? 0,
      enabledMarketingTokens: enabledTokens.count ?? 0,
      lastCheckedAt: formatDateTimeForDisplay(new Date().toISOString()),
    });
  };

  const refreshPushAdminData = async (silent = false) => {
    await Promise.all([loadSupabasePushCampaigns(silent), loadPushDiagnostics(silent)]);
  };

  const loadCustomerOrdersFromSupabase = async (userId: string) => {
    if (!isSupabaseConfigured || !userId) {
      return;
    }
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Commandes client', error.message);
      return;
    }
    const remoteOrders = data?.map(mapSupabaseOrder) ?? [];
    setOrders(remoteOrders);
  };

  const getRemoteSlotUsage = async (restaurantId: string, pickupAt: string) => {
    if (!isSupabaseConfigured) {
      return 0;
    }
    const pickupIso = parsePickupAtToIso(pickupAt);
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('pickup_at', pickupIso)
      .not('status', 'in', '("Annulée","Terminée")');
    if (error) {
      console.warn('Capacité créneau non vérifiée côté Supabase', error.message);
      return 0;
    }
    return count ?? 0;
  };

  const isPickupSlotFull = async (restaurant: Restaurant, pickupAt: string) => {
    const localUsage = orders.filter((order) =>
      order.restaurantId === restaurant.id &&
      !['Annulée', 'Terminée'].includes(order.status) &&
      getPickupSlotKey(order.pickupAt) === pickupAt
    ).length;
    const remoteUsage = await getRemoteSlotUsage(restaurant.id, pickupAt);
    return Math.max(localUsage, remoteUsage) >= restaurant.capacityPerSlot;
  };

  const loadTrackedOrder = async (order: Order) => {
    if (!isSupabaseConfigured || !order.trackingToken) {
      return null;
    }
    const { data, error } = await supabase.rpc('get_order_tracking', {
      p_order_id: order.id,
      p_tracking_token: order.trackingToken,
    });
    if (error) {
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapSupabaseOrder(row) : null;
  };

  useEffect(() => {
    if (!startupSplashVisible) {
      return undefined;
    }
    const timer = setTimeout(() => setStartupSplashVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [startupSplashVisible]);

  useEffect(() => {
    if (screen === 'admin' && !isAdminWebRoute()) {
      setScreen('welcome');
    }
  }, [screen]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAdminAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    adminSupabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        const nextProfile = await loadAdminProfile(data.session.user.id);
        if (!nextProfile) {
          await adminSupabase.auth.signOut();
          setAdminSession(null);
        } else {
          setAdminSession(data.session);
        }
      } else {
        setAdminSession(null);
        setAdminProfile(null);
      }
      if (mounted) {
        setAdminAuthLoading(false);
      }
    });
    const { data: listener } = adminSupabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void (async () => {
          const nextProfile = await loadAdminProfile(session.user.id);
          if (!nextProfile) {
            await adminSupabase.auth.signOut();
            setAdminSession(null);
            setAdminProfile(null);
            return;
          }
          setAdminSession(session);
        })();
      } else {
        setAdminSession(null);
        setAdminProfile(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        void hydrateClientProfileFromSession();
        return;
      }
      if (profileRef.current.userId) {
        applyClientAuthClearedState('guestOnlyWeb');
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        void hydrateClientProfileFromSession();
        return;
      }
      if (event !== 'SIGNED_OUT' && event !== 'INITIAL_SESSION') {
        return;
      }
      if (!profileRef.current.userId) {
        return;
      }
      applyClientAuthClearedState('guestOnlyWeb');
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void syncMarketingPushDevice(profile);
  }, [profile.userId, profile.marketingPushConsent, profile.accountCreated]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isSupabaseConfigured) {
      return undefined;
    }
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncMarketingPushDevice(profileRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !isSupabaseConfigured) {
      return undefined;
    }
    const openFromUrl = async (url: string | null) => {
      if (!url || !isNativePasswordRecoveryDeepLink(url)) {
        return;
      }
      const kind = getPasswordRecoveryUrlKind(url);
      const pathnameForLog = getPasswordRecoveryPathForLog(url);
      const { access_token, refresh_token, code } = parseRecoveryParamsFromUrl(url);
      const hasAccessPair = Boolean(access_token && refresh_token);
      const hasCode = Boolean(code);
      if (__DEV__) {
        console.log('[pwd-reset-deep-link] incoming', {
          kind,
          pathname: pathnameForLog,
          hasAccessPair,
          hasCode,
        });
      }
      if (!hasAccessPair && !hasCode) {
        if (__DEV__) {
          console.log('[pwd-reset-deep-link] skip-empty-credentials');
        }
        return;
      }
      const sessionResult = await establishRecoverySessionFromParams({ access_token, refresh_token, code });
      if (!sessionResult.ok) {
        if (__DEV__) {
          console.log('[pwd-reset-deep-link] session-establish-failed', { message: sessionResult.error });
        }
        Alert.alert('Réinitialisation impossible', sessionResult.error);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        if (__DEV__) {
          console.log('[pwd-reset-deep-link] session-missing-after-establish');
        }
        Alert.alert(
          'Réinitialisation impossible',
          'Session introuvable après le lien. Redemande un nouveau lien « Mot de passe oublié ».',
        );
        return;
      }
      if (__DEV__) {
        console.log('[pwd-reset-deep-link] session-ok', { userIdPresent: true });
      }
      setStartupSplashVisible(false);
      setNativePasswordResetVisible(true);
    };
    void Linking.getInitialURL().then((url) => void openFromUrl(url));
    const sub = Linking.addEventListener('url', ({ url }) => {
      void openFromUrl(url);
    });
    return () => sub.remove();
  }, [isSupabaseConfigured]);

  useEffect(() => {
    if (screen === 'orders' && isSupabaseConfigured && profile.accountCreated) {
      void loadReviewedOrderIds();
    }
  }, [screen, profile.accountCreated, profile.userId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !profile.userId || !profile.accountCreated) {
      return;
    }
    if (adminProfile && canAccessAdmin(adminProfile.role)) {
      return;
    }
    void loadCustomerOrdersFromSupabase(profile.userId);
  }, [isSupabaseConfigured, profile.userId, profile.accountCreated, adminProfile?.id, adminProfile?.role]);

  useEffect(() => {
    if (menuProducts.length === 0 || cartRestoredRef.current) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const payload = await loadCartPayload();
      if (cancelled) {
        return;
      }
      cartRestoredRef.current = true;
      if (!payload?.items?.length) {
        return;
      }
      const hydrated = hydrateCartFromPayload(payload, menuProducts);
      if (!hydrated.length) {
        return;
      }
      setCart(hydrated);
      setSelectedRestaurantId((current) =>
        restaurantSettingsRef.current.some((r) => r.id === payload.restaurantId) ? payload.restaurantId : current,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [menuProducts.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (skipCartPersistRef.current) {
        skipCartPersistRef.current = false;
        return;
      }
      void saveCartPayload(serializeCartPayload(selectedRestaurantId, cart));
    }, 500);
    return () => clearTimeout(timer);
  }, [cart, selectedRestaurantId]);

  useEffect(() => {
    let cancelled = false;
    const hydrateFromSupabase = async () => {
      const bootstrap = await loadSupabaseBootstrap();
      if (!bootstrap || cancelled) {
        return;
      }
      if (bootstrap.restaurants.length) {
        setRestaurantSettingsState(bootstrap.restaurants);
        storeRestaurants(bootstrap.restaurants);
      }
      if (bootstrap.categories.length) {
        setMenuCategoriesState(bootstrap.categories);
        storeCategories(bootstrap.categories);
      }
      if (bootstrap.products.length) {
        setMenuProductsState(bootstrap.products);
        storeProducts(bootstrap.products);
      }
      if (bootstrap.offers.length) {
        setOffersState(bootstrap.offers);
        storeOffers(bootstrap.offers);
      }
      if (bootstrap.coupon) {
        setCouponConfigState(bootstrap.coupon);
        storeCoupon(bootstrap.coupon);
      }
    };

    void hydrateFromSupabase();
    const refreshTimer = setInterval(() => {
      void hydrateFromSupabase();
    }, 5000);
    const channel = isSupabaseConfigured
      ? supabase
        .channel('client-catalog')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, () => {
          void hydrateFromSupabase();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
          void hydrateFromSupabase();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
          void hydrateFromSupabase();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, () => {
          void hydrateFromSupabase();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, () => {
          void hydrateFromSupabase();
        })
        .subscribe()
      : null;
    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !adminProfile || !canAccessAdmin(adminProfile.role)) {
      return undefined;
    }

    void loadSupabaseOrders(true);
    const refreshTimer = setInterval(() => {
      void loadSupabaseOrders(true);
    }, 2500);
    const channel = adminSupabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void loadSupabaseOrders(true);
      })
      .subscribe();

    return () => {
      clearInterval(refreshTimer);
      void adminSupabase.removeChannel(channel);
    };
  }, [adminProfile?.id, adminProfile?.role]);

  useEffect(() => {
    if (!isSupabaseConfigured || !adminProfile || !canAccessAdmin(adminProfile.role)) {
      return undefined;
    }

    void loadSupabaseReviews(true);
    const channel = adminSupabase
      .channel('admin-reviews')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        void loadSupabaseReviews(true);
      })
      .subscribe();

    return () => {
      void adminSupabase.removeChannel(channel);
    };
  }, [adminProfile?.id, adminProfile?.role]);

  useEffect(() => {
    if (!isSupabaseConfigured || !adminProfile || !canAccessAdmin(adminProfile.role)) {
      return undefined;
    }

    void refreshPushAdminData(true);
    const channel = adminSupabase
      .channel('admin-push-campaigns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'push_campaigns' }, () => {
        void loadSupabasePushCampaigns(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_push_tokens' }, () => {
        void loadPushDiagnostics(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void loadPushDiagnostics(true);
      })
      .subscribe();

    return () => {
      void adminSupabase.removeChannel(channel);
    };
  }, [adminProfile?.id, adminProfile?.role]);

  useEffect(() => {
    if (!isSupabaseConfigured || !trackedOrder.trackingToken || trackedOrder.id === NO_TRACKED_ORDER_ID) {
      return undefined;
    }

    const syncTrackedOrder = async () => {
      const remoteOrder = await loadTrackedOrder(trackedOrder);
      if (!remoteOrder) {
        return;
      }
      const nextOrder = {
        ...remoteOrder,
        trackingToken: trackedOrder.trackingToken || remoteOrder.trackingToken,
      };
      setTrackedOrder((current) => (current.id === nextOrder.id ? { ...current, ...nextOrder } : current));
      setOrders((current) => {
        const exists = current.some((order) => order.id === nextOrder.id);
        return exists ? current.map((order) => (order.id === nextOrder.id ? { ...order, ...nextOrder } : order)) : [nextOrder, ...current];
      });
    };

    void syncTrackedOrder();
    const refreshTimer = setInterval(() => {
      void syncTrackedOrder();
    }, 2500);
    const channel = supabase
      .channel(`client-order-${trackedOrder.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${trackedOrder.id}` }, () => {
        void syncTrackedOrder();
      })
      .subscribe();

    return () => {
      clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [trackedOrder.id, trackedOrder.trackingToken]);

  useEffect(() => {
    const statusKey = `${trackedOrder.id}:${trackedOrder.status}`;
    if (lastTrackedStatusRef.current === statusKey) {
      return;
    }
    lastTrackedStatusRef.current = statusKey;
    if (trackedOrder.id === NO_TRACKED_ORDER_ID) {
      return;
    }
    const notification = getClientNotification(trackedOrder);
    if (!notification) {
      return;
    }
    setClientNotification(notification);
    sendBrowserNotification(notification);
    const timer = setTimeout(() => setClientNotification(null), 6000);
    return () => clearTimeout(timer);
  }, [trackedOrder.id, trackedOrder.status, trackedOrder.refusalReason, trackedOrder.notifyWhenReady]);

  useEffect(() => {
    if (!isSupabaseConfigured || !profile.accountCreated || !profile.userId) {
      return undefined;
    }

    void loadLoyaltyFromServer(profile.userId);
    const refreshTimer = setInterval(() => {
      void loadLoyaltyFromServer(profile.userId);
    }, 10000);
    const channel = supabase
      .channel(`client-loyalty-${profile.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_accounts', filter: `user_id=eq.${profile.userId}` }, () => {
        void loadLoyaltyFromServer(profile.userId);
      })
      .subscribe();

    return () => {
      clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [profile.accountCreated, profile.userId]);

  useEffect(() => {
    if (trackedOrder.status === 'Terminée' && profile.userId) {
      void loadLoyaltyFromServer(profile.userId);
    }
  }, [trackedOrder.id, trackedOrder.status, profile.userId]);

  useEffect(() => {
    const availableCategories = menuCategories.filter((category) => isCategoryAvailableForRestaurant(category, selectedRestaurantId));
    if (!availableCategories.some((category) => category.label === selectedCategory)) {
      setSelectedCategory(availableCategories[0]?.label ?? menuCategories[0]?.label ?? 'Entrées');
    }
  }, [menuCategories, selectedCategory, selectedRestaurantId]);

  useEffect(() => {
    if (clientRestaurants.length && !clientRestaurants.some((restaurant) => restaurant.id === selectedRestaurantId)) {
      setSelectedRestaurantId(clientRestaurants[0].id);
    }
  }, [clientRestaurants, selectedRestaurantId]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + getItemTotal(item), 0);
  const normalizedCouponCode = couponConfig.code.trim().toUpperCase();
  const couponMatches = coupon.trim().toUpperCase() === normalizedCouponCode;
  const couponCanApply = couponConfig.active && couponMatches && subtotal >= couponConfig.minAmount && couponConfig.used < couponConfig.maxUses;
  const discount = couponCanApply
    ? couponConfig.type === 'percent'
      ? subtotal * (couponConfig.value / 100)
      : couponConfig.value
    : 0;
  const appliedCouponCode = couponCanApply ? normalizedCouponCode : '';
  const loyaltyDiscount = useLoyaltyReward && loyalty.rewardCredits > 0 ? Math.min(rewardValue, Math.max(subtotal - discount, 0)) : 0;
  const total = Math.max(subtotal - discount - loyaltyDiscount, 0);
  const checkoutPoints = Math.floor(total / 10);
  const visibleCategories = useMemo(
    () => menuCategories.filter((category) => isCategoryAvailableForRestaurant(category, selectedRestaurantId)),
    [menuCategories, selectedRestaurantId],
  );

  const filteredProducts = useMemo(
    () =>
      menuProducts.filter((product) => {
        const matchesCategory = product.category === selectedCategory;
        const matchesQuery = product.name.toLowerCase().includes(query.toLowerCase());
        const matchesRestaurant = isProductAvailableForRestaurant(product, selectedRestaurantId);
        return matchesCategory && matchesQuery && matchesRestaurant;
      }),
    [menuProducts, query, selectedCategory, selectedRestaurantId],
  );

  const addToCart = (item: CartItem) => {
    setCart((current) => [...current, item]);
    setSelectedProduct(null);
    setAddedCartItemName(item.product.name);
  };

  const updateQuantity = (index: number, quantity: number) => {
    setCart((current) =>
      current
        .map((item, itemIndex) => (itemIndex === index ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
    );
  };

  const createOrder = async (checkout: CheckoutPayload) => {
    if (orderSubmitting) {
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Panier vide', 'Ajoute au moins un plat avant de valider la commande.');
      setScreen('menu');
      return;
    }
    if (!profile.accountCreated) {
      Alert.alert('Compte requis', 'Crée ton compte client avant de valider une commande.');
      setScreen('profile');
      return;
    }
    if (!canRestaurantReceiveOrders(selectedRestaurant)) {
      Alert.alert('Commandes en pause', 'Le restaurant ne prend pas de commandes actuellement.');
      return;
    }
    if (selectedRestaurant.archived) {
      Alert.alert('Restaurant archivé', 'Ce restaurant ne prend plus de commandes dans l’application.');
      return;
    }
    const selectedSlot = getPickupSlotOptions(selectedRestaurant, orders).find((option) => option.value === checkout.pickupAt);
    if (!selectedSlot || selectedSlot.isFull) {
      Alert.alert('Créneau complet', 'Ce créneau vient d’atteindre sa capacité. Choisis un autre horaire.');
      return;
    }
    if (await isPickupSlotFull(selectedRestaurant, checkout.pickupAt)) {
      Alert.alert('Créneau complet', 'Ce créneau vient d’atteindre sa capacité. Choisis un autre horaire.');
      return;
    }
    setOrderSubmitting(true);
    try {
      let orderUserId = profile.userId;
      if (isSupabaseConfigured) {
        const [{ data: sessionData }, { data: userData, error: userError }] = await Promise.all([
          supabase.auth.getSession(),
          supabase.auth.getUser(),
        ]);
        const authenticatedUser = userData.user ?? sessionData.session?.user;
        if (userError || !authenticatedUser) {
          await supabase.auth.signOut();
          setProfile((current) => ({ ...current, accountCreated: false, userId: undefined }));
          Alert.alert(
            'Connexion requise',
            'Reconnecte-toi à ton compte client avant de valider la commande. La session locale n’est plus valide.',
          );
          setScreen('profile');
          return;
        }
        const sessionUserId = authenticatedUser.id;
        if (profile.userId && profile.userId !== sessionUserId) {
          Alert.alert(
            'Session différente',
            'Le compte connecté ne correspond pas au profil affiché. Déconnecte-toi puis reconnecte-toi avant de commander.',
          );
          setScreen('profile');
          return;
        }
        orderUserId = sessionUserId;
        if (!profile.userId) {
          setProfile((current) => ({ ...current, userId: sessionUserId, accountCreated: true }));
        }
      }
      if (!orderUserId) {
        Alert.alert(
          'Connexion requise',
          'Reconnecte-toi à ton compte client avant de valider la commande.',
        );
        setScreen('profile');
        return;
      }

      const createdOrder: Order = {
        id: `AC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 8999)}`,
        restaurantId: selectedRestaurantId,
        createdAt: new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        pickupAt: checkout.pickupAt,
        status: 'Nouvelle',
        total,
        items: cart,
        userId: orderUserId,
        customerName: `${checkout.firstName.trim()} ${checkout.lastName.trim()}`.trim(),
        customerPhone: checkout.phone.trim(),
        customerEmail: checkout.email.trim(),
        customerPostalAddress: checkout.address.trim(),
        couponCode: appliedCouponCode,
        loyaltyDiscount,
        notifyWhenReady: checkout.notifyWhenReady,
        isPreorder: !selectedRestaurant.isOpen && canRestaurantReceiveOrders(selectedRestaurant),
        trackingToken: createTrackingToken(),
        estimatedPrepMinutes: Math.max(...cart.map((item) => item.product.prepMinutes), 10),
      };
      const showConfirmedOrder = () => {
        setOrders((current) => [createdOrder, ...current]);
        setUseLoyaltyReward(false);
        setTrackedOrder(createdOrder);
        lastTrackedStatusRef.current = `${createdOrder.id}:${createdOrder.status}`;
        setCart([]);
        setCoupon('');
        setScreen('tracking');
        void requestClientNotificationPermission();
      };
      const applyLocalCouponOnly = () => {
        if (couponCanApply) {
          setCouponConfig((current) => ({ ...current, used: current.used + 1 }));
        }
        if (loyaltyDiscount > 0) {
          setLoyalty((current) => ({
            ...current,
            rewardCredits: Math.max(0, current.rewardCredits - 1),
          }));
        }
      };
      if (isSupabaseConfigured) {
        await createOrderRemote(createdOrder);
        showConfirmedOrder();
        if (couponCanApply) {
          const { data: couponRow } = await supabase.from('coupons').select('*').eq('code', couponConfig.code).maybeSingle();
          if (couponRow) {
            const mapped = mapSupabaseCoupon(couponRow);
            setCouponConfigState(mapped);
            storeCoupon(mapped);
          }
        }
        await loadLoyaltyFromServer(orderUserId);
        await registerOrderPushToken(createdOrder);
      } else {
        showConfirmedOrder();
        applyLocalCouponOnly();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Supabase a refusé la commande. Elle n’a pas été envoyée en cuisine.';
      Alert.alert('Commande non envoyée', message);
      console.warn('Commande non envoyée', error);
    } finally {
      setOrderSubmitting(false);
    }
  };

  const reorder = (order: Order) => {
    setSelectedRestaurantId(order.restaurantId);
    setCart(order.items);
    setScreen('cart');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'welcome':
        return <WelcomeScreen offers={offers} onStart={() => setScreen('restaurants')} />;
      case 'restaurants':
        return (
          <RestaurantsScreen
            restaurants={clientRestaurants}
            onSelect={(restaurant) => {
              setSelectedRestaurantId(restaurant.id);
              setScreen('menu');
            }}
          />
        );
      case 'menu':
        return (
          <MenuScreen
            restaurant={selectedRestaurant}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            categories={visibleCategories}
            products={filteredProducts}
            query={query}
            setQuery={setQuery}
            onSelectRestaurant={() => setScreen('restaurants')}
            onSelectProduct={setSelectedProduct}
          />
        );
      case 'cart':
        return (
          <CartScreen
            cart={cart}
            coupon={coupon}
            discount={discount}
            appliedCouponCode={appliedCouponCode}
            loyaltyDiscount={loyaltyDiscount}
            loyaltyCredits={loyalty.rewardCredits}
            useLoyaltyReward={useLoyaltyReward}
            setUseLoyaltyReward={setUseLoyaltyReward}
            setCoupon={setCoupon}
            subtotal={subtotal}
            total={total}
            accountCreated={profile.accountCreated}
            onMenu={() => setScreen('menu')}
            onCheckout={() => {
              if (!profile.accountCreated) {
                Alert.alert('Compte requis', 'Crée ton compte client avant de valider une commande.');
                setScreen('profile');
                return;
              }
              if (!canRestaurantReceiveOrders(selectedRestaurant)) {
                Alert.alert('Commandes en pause', 'Le restaurant ne prend pas de commandes actuellement.');
                return;
              }
              setScreen('checkout');
            }}
            onQuantity={updateQuantity}
          />
        );
      case 'checkout':
        return (
          <CheckoutScreen
            restaurant={selectedRestaurant}
            cart={cart}
            orders={orders}
            profile={profile}
            total={total}
            pointsEarned={checkoutPoints}
            discount={discount}
            appliedCouponCode={appliedCouponCode}
            loyaltyDiscount={loyaltyDiscount}
            submitting={orderSubmitting}
            onBack={() => setScreen('cart')}
            onCreateOrder={createOrder}
          />
        );
      case 'orders':
        return (
          <OrdersScreen
            orders={orders}
            reviewedOrderIds={reviewedOrderIds}
            accountCreated={profile.accountCreated}
            currentUserId={profile.userId}
            onOpenProfile={() => setScreen('profile')}
            onReorder={reorder}
            onTrack={(order) => {
              setTrackedOrder(order);
              setScreen('tracking');
            }}
            onReview={(order) => setReviewModalOrder(order)}
          />
        );
      case 'tracking':
        return <TrackingScreen order={trackedOrder} onBack={() => setScreen('profile')} onCancel={requestCancelTrackedOrder} />;
      case 'profile':
        return (
          <ProfileScreen
            loyalty={loyalty}
            profile={profile}
            setProfile={setProfile}
            restaurants={clientRestaurants}
            onOrders={() => setScreen('orders')}
            onPreferredRestaurant={(restaurantId) => setSelectedRestaurantId(restaurantId)}
            onCreateAccount={createCustomerAccount}
            onSignInCustomer={signInCustomer}
            onSignOutCustomer={signOutCustomer}
            onSaveProfile={saveCustomerProfile}
            onDeleteAccount={deleteCustomerAccount}
            onClaimLoyaltyReward={claimLoyaltyRewardRemote}
            onRequestPasswordReset={requestPasswordReset}
          />
        );
      case 'admin':
        if (adminAuthLoading) {
          return <AdminAuthLoadingScreen />;
        }
        if (!adminSession || !adminProfile || !canAccessAdmin(adminProfile.role)) {
          return <AdminLoginScreen onLogin={signInAdmin} />;
        }
        return (
          <AdminScreen
            tab={adminTab}
            setTab={setAdminTab}
            adminProfile={adminProfile}
            orders={orders}
            reviews={reviews}
            setOrders={setOrders}
            onOrderStatusPersist={updateOrderStatusRemote}
            onOrdersRefresh={loadSupabaseOrders}
            onReviewsRefresh={loadSupabaseReviews}
            products={menuProducts}
            setProducts={setMenuProducts}
            onProductPersist={upsertProduct}
            onProductDelete={deleteProduct}
            categories={menuCategories}
            setCategories={setMenuCategories}
            onCategoryPersist={upsertCategory}
            onCategoryDelete={deleteCategoryRemote}
            coupon={couponConfig}
            setCoupon={setCouponConfig}
            onCouponPersist={upsertCoupon}
            offers={offers}
            setOffers={setOffers}
            onOfferPersist={upsertOffer}
            onOfferDelete={deleteOffer}
            restaurants={restaurantSettings}
            setRestaurants={setRestaurantSettings}
            onRestaurantPersist={upsertRestaurant}
            pushCampaigns={pushCampaigns}
            setPushCampaigns={setPushCampaigns}
            offerPushCampaigns={offerPushCampaigns}
            setOfferPushCampaigns={setOfferPushCampaigns}
            pushDiagnostics={pushDiagnostics}
            onMarketingEmail={sendMarketingEmail}
            onMarketingPush={sendMarketingPushCampaign}
            onPushRefresh={refreshPushAdminData}
            onExit={() => {
              replaceWebPath('/');
              setScreen('welcome');
            }}
            onSignOut={signOutAdmin}
          />
        );
      default:
        return null;
    }
  };

  const showClientProgress =
    screen !== 'admin' &&
    !['Terminée', 'Annulée'].includes(trackedOrder.status) &&
    trackedOrder.id !== NO_TRACKED_ORDER_ID;

  if (isPasswordResetRoute()) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <PasswordResetScreen
          onSubmit={completePasswordReset}
          onOpenApp={() => {
            replaceWebPath('/app');
            setScreen('profile');
          }}
        />
      </SafeAreaView>
    );
  }

  if (Platform.OS !== 'web' && nativePasswordResetVisible) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <PasswordResetScreen
          onSubmit={completePasswordReset}
          onOpenApp={() => {
            setNativePasswordResetVisible(false);
            setScreen('profile');
          }}
        />
      </SafeAreaView>
    );
  }

  if (isDownloadLandingRoute()) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <DownloadLandingScreen
          onOpenClientApp={() => {
            replaceWebPath('/app');
            setScreen('welcome');
          }}
        />
      </SafeAreaView>
    );
  }

  if (startupSplashVisible) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <StartupSplashScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={screen === 'welcome' || screen === 'menu' || screen === 'restaurants' ? 'light' : 'dark'} />
      <View style={[styles.appShell, screen === 'admin' && styles.adminAppShell]}>
        {showClientProgress ? <OrderProgressBanner order={trackedOrder} onPress={() => setScreen('tracking')} /> : null}
        <View style={styles.contentShell}>{renderScreen()}</View>
        {screen !== 'admin' ? (
          <BottomNav current={screen} cartCount={cartCount} onNavigate={setScreen} />
        ) : null}
      </View>
      <AddedToCartPrompt
        itemName={addedCartItemName}
        cartCount={cartCount}
        onContinue={() => setAddedCartItemName('')}
        onCart={() => {
          setAddedCartItemName('');
          setScreen('cart');
        }}
      />
      <ClientNotificationToast notification={clientNotification} onClose={() => setClientNotification(null)} />
      <OrderReviewModal
        order={reviewModalOrder}
        onClose={() => setReviewModalOrder(null)}
        onSubmit={async (rating, comment) => {
          if (!reviewModalOrder) {
            return;
          }
          await submitOrderReview(reviewModalOrder, rating, comment);
        }}
      />
      <ProductSheet product={selectedProduct} restaurant={selectedRestaurant} onClose={() => setSelectedProduct(null)} onAdd={addToCart} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AlloApp />
    </AppErrorBoundary>
  );
}

function ClientNotificationToast({ notification, onClose }: { notification: ClientNotification | null; onClose: () => void }) {
  if (!notification) {
    return null;
  }

  return (
    <View style={styles.clientToast}>
      <View style={styles.flex}>
        <Text style={styles.clientToastTitle}>{notification.title}</Text>
        <Text style={styles.clientToastText}>{notification.message}</Text>
      </View>
      <Pressable style={styles.clientToastClose} onPress={onClose}>
        <Text style={styles.clientToastCloseText}>×</Text>
      </Pressable>
    </View>
  );
}

function StartupSplashScreen() {
  return (
    <ImageBackground source={restaurantHero} style={styles.startupSplash} imageStyle={styles.startupSplashImage}>
      <View style={styles.startupSplashOverlay}>
        <Image source={clientLogo} style={styles.startupSplashLogo} resizeMode="contain" />
        <Text style={styles.startupSplashText}>À votre service depuis 1994</Text>
      </View>
    </ImageBackground>
  );
}

function PasswordResetScreen({
  onSubmit,
  onOpenApp,
}: {
  onSubmit: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenApp: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: 'error' | 'success'; text: string } | null>(null);

  const submit = async () => {
    setFeedback(null);
    if (!password || !confirmPassword) {
      setFeedback({ variant: 'error', text: 'Renseigne et confirme ton nouveau mot de passe.' });
      return;
    }
    if (password !== confirmPassword) {
      setFeedback({ variant: 'error', text: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }
    setBusy(true);
    const result = await onSubmit(password);
    setBusy(false);
    if (!result.ok) {
      setFeedback({ variant: 'error', text: result.error ?? 'Réinitialisation impossible.' });
      return;
    }
    setPassword('');
    setConfirmPassword('');
    setFeedback({ variant: 'success', text: 'Mot de passe modifié. Tu peux maintenant te connecter avec ton nouveau mot de passe.' });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.profileContent}>
      <View style={styles.formCard}>
        <Image source={clientLogo} style={styles.downloadLandingLogo} resizeMode="contain" />
        <Text style={styles.sectionTitle}>Nouveau mot de passe</Text>
        <Text style={styles.helperText}>Choisis un nouveau mot de passe pour ton compte Allo Couscous.</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Nouveau mot de passe</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Confirmer le mot de passe</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
        {feedback ? (
          <View style={[styles.formBanner, feedback.variant === 'error' ? styles.formBannerError : styles.formBannerSuccess]}>
            <Text style={feedback.variant === 'error' ? styles.formBannerErrorText : styles.formBannerSuccessText}>
              {feedback.text}
            </Text>
          </View>
        ) : null}
        <Pressable style={[styles.primaryButton, busy && styles.buttonDisabled]} onPress={() => void submit()} disabled={busy}>
          <Text style={styles.primaryButtonText}>{busy ? 'Modification...' : 'Modifier le mot de passe'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onOpenApp}>
          <Text style={styles.secondaryButtonText}>Retour à l’application</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function DownloadLandingScreen({
  onOpenClientApp,
}: {
  onOpenClientApp: () => void;
}) {
  const preferredStore = getPreferredStore();
  const primaryPlatform = preferredStore === 'desktop' ? null : preferredStore;
  const primaryLabel = primaryPlatform === 'android' ? 'Télécharger sur Google Play' : 'Télécharger sur l’App Store';

  return (
    <ImageBackground source={restaurantHero} style={styles.downloadLanding} imageStyle={styles.downloadLandingImage}>
      <View style={styles.downloadLandingOverlay}>
        <View style={styles.downloadLandingCard}>
          <Image source={appLogo} style={styles.downloadLandingAppLogo} resizeMode="cover" />
          <Image source={clientLogo} style={styles.downloadLandingLogo} resizeMode="contain" />
          <Text style={styles.downloadLandingTitle}>Télécharger Allo Couscous</Text>
          <Text style={styles.downloadLandingText}>Click and collect, paiement au retrait de la commande.</Text>
          {primaryPlatform ? (
            <Pressable style={styles.downloadPrimaryButton} onPress={() => void openStoreUrl(primaryPlatform)}>
              <Text style={styles.downloadPrimaryButtonText}>{primaryLabel}</Text>
            </Pressable>
          ) : (
            <Text style={styles.downloadLandingHint}>Ouvre cette page depuis ton téléphone ou choisis le store ci-dessous.</Text>
          )}
          <View style={styles.downloadStoreRow}>
            <Pressable style={styles.downloadStoreBadge} onPress={() => void openStoreUrl('ios')}>
              <Text style={styles.downloadStoreBadgeIcon}></Text>
              <View style={styles.downloadStoreBadgeCopy}>
                <Text style={styles.downloadStoreBadgeEyebrow}>Télécharger dans</Text>
                <Text style={styles.downloadStoreBadgeTitle}>App Store</Text>
              </View>
            </Pressable>
            <Pressable style={styles.downloadStoreBadge} onPress={() => void openStoreUrl('android')}>
              <Text style={styles.downloadStoreBadgeIcon}>▶</Text>
              <View style={styles.downloadStoreBadgeCopy}>
                <Text style={styles.downloadStoreBadgeEyebrow}>Disponible sur</Text>
                <Text style={styles.downloadStoreBadgeTitle}>Google Play</Text>
              </View>
            </Pressable>
          </View>
          <Pressable style={styles.downloadGhostButton} onPress={onOpenClientApp}>
            <Text style={styles.downloadGhostButtonText}>Ouvrir la version web</Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
}

function AddedToCartPrompt({
  itemName,
  cartCount,
  onContinue,
  onCart,
}: {
  itemName: string;
  cartCount: number;
  onContinue: () => void;
  onCart: () => void;
}) {
  if (!itemName) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible={Boolean(itemName)} onRequestClose={onContinue}>
      <View style={styles.cartChoiceBackdrop}>
        <View style={styles.cartChoiceCard}>
          <Text style={styles.cartChoiceTitle}>Ajouté au panier</Text>
          <Text style={styles.cartChoiceText}>{itemName}</Text>
          <Text style={styles.cartChoiceMeta}>{cartCount} article{cartCount > 1 ? 's' : ''} dans votre panier</Text>
          <View style={styles.cartChoiceActions}>
            <Pressable style={styles.secondaryButton} onPress={onContinue}>
              <Text style={styles.secondaryButtonText}>Continuer mes achats</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={onCart}>
              <Text style={styles.primaryButtonText}>Voir le panier</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OrderReviewModal({
  order,
  onClose,
  onSubmit,
}: {
  order: Order | null;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (order) {
      setRating(5);
      setComment('');
      setError('');
    }
  }, [order?.id]);
  if (!order) {
    return null;
  }
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSubmit(rating, comment.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal transparent animationType="fade" visible={Boolean(order)} onRequestClose={onClose}>
      <View style={styles.cartChoiceBackdrop}>
        <ScrollView contentContainerStyle={styles.reviewModalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.cartChoiceCard}>
            <Text style={styles.cartChoiceTitle}>Ton avis</Text>
            <Text style={styles.helperText}>Commande {order.id}</Text>
            <Text style={styles.inputLabel}>Note</Text>
            <View style={styles.reviewStarsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setRating(star)} accessibilityRole="button">
                  <Text style={[styles.reviewStar, star <= rating && styles.reviewStarActive]}>★</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Commentaire (optionnel)</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                style={[styles.input, styles.reviewCommentInput]}
                multiline
                placeholder="Merci pour ton retour…"
              />
            </View>
            {error ? <Text style={styles.reviewErrorText}>{error}</Text> : null}
            <View style={styles.cartChoiceActions}>
              <Pressable style={styles.secondaryButton} onPress={onClose} disabled={saving}>
                <Text style={styles.secondaryButtonText}>Annuler</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={() => void submit()} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Envoi…' : 'Envoyer'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function OrderProgressBanner({ order, onPress }: { order: Order; onPress: () => void }) {
  const isCancelled = order.status === 'Annulée';
  const currentIndex = isCancelled ? orderSteps.length - 1 : Math.max(orderSteps.indexOf(order.status), 0);
  return (
    <Pressable style={[styles.orderProgressBanner, isCancelled && styles.orderProgressBannerCancelled]} onPress={onPress}>
      <View style={styles.orderProgressHeader}>
        <View style={styles.flex}>
          <Text style={styles.orderProgressTitle}>Suivi de commande</Text>
          <Text style={styles.orderProgressMeta}>{order.id} · Retrait {order.pickupAt}</Text>
        </View>
        <Text style={[styles.orderProgressStatus, isCancelled && styles.orderProgressStatusCancelled]}>{order.status}</Text>
      </View>
      <View style={styles.orderProgressTrack}>
        {orderSteps.map((step, index) => (
          <View
            key={step}
            style={[
              styles.orderProgressSegment,
              index <= currentIndex && styles.orderProgressSegmentActive,
              isCancelled && index <= currentIndex && styles.orderProgressSegmentCancelled,
            ]}
          />
        ))}
      </View>
      <View style={styles.orderProgressFooter}>
        <Text style={styles.orderProgressStep}>{getTimelineCopy(order.status)}</Text>
        <Text style={styles.orderProgressLink}>Détail ›</Text>
      </View>
    </Pressable>
  );
}

function WelcomeScreen({ offers, onStart }: { offers: OfferConfig[]; onStart: () => void }) {
  const activeOffers = offers.filter((offer) => offer.active);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.welcomeContent}>
      <ImageBackground source={restaurantHero} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroOverlay}>
          <Image source={clientLogo} style={styles.heroLogo} resizeMode="contain" />
          <Text style={styles.heroSubtitle}>À votre service depuis 1994</Text>
        </View>
      </ImageBackground>

      <View style={styles.homeQuickStats}>
        <Text style={styles.homeQuickValue}>Click and collect</Text>
        <Text style={styles.homeQuickLabel}>Paiement au retrait de la commande</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Text style={styles.smallIcon}>%</Text>
          <Text style={styles.sectionTitle}>Nos offres du moment</Text>
        </View>
        {activeOffers.length ? (
          activeOffers.map((offer) => (
            <View key={offer.id} style={styles.offerCard}>
              <Image source={{ uri: offer.image || tajineImage }} style={styles.offerImage} />
              <View style={styles.offerBody}>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerText}>{offer.text}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.offerCard}>
            <Image source={{ uri: tajineImage }} style={styles.offerImage} />
            <View style={styles.offerBody}>
              <Text style={styles.offerTitle}>Aucune offre active</Text>
              <Text style={styles.offerText}>Le restaurant peut activer une nouvelle bannière depuis le panneau admin.</Text>
            </View>
          </View>
        )}
        <Pressable style={styles.primaryButton} onPress={onStart}>
          <Text style={styles.primaryButtonText}>Commander maintenant  ›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function RestaurantsScreen({ restaurants, onSelect }: { restaurants: Restaurant[]; onSelect: (restaurant: Restaurant) => void }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.restaurantContent}>
      <ImageBackground source={restaurantHero} style={styles.restaurantHero} imageStyle={styles.heroImage}>
        <View style={styles.heroOverlay}>
          <Image source={clientLogo} style={styles.restaurantHeroLogo} resizeMode="contain" />
          <Text style={styles.heroSubtitle}>Choisissez votre restaurant pour commander</Text>
        </View>
      </ImageBackground>

      <View style={styles.restaurantList}>
        {restaurants.map((restaurant) => {
          const canReceiveOrders = canRestaurantReceiveOrders(restaurant);
          const isPaused = restaurant.acceptingOrders === false;
          return (
          <Pressable key={restaurant.id} style={[styles.restaurantCard, isPaused && styles.restaurantCardPaused]} onPress={() => onSelect(restaurant)}>
            <View style={[styles.restaurantCardBand, isPaused && styles.restaurantCardBandPaused]} />
            <View style={styles.restaurantInfo}>
              <Text style={styles.restaurantName}>{restaurant.name}</Text>
              <InfoLine icon="⌖" text={restaurant.address} />
              <InfoLine icon="☎" text={restaurant.phone} />
              <InfoLine icon="◷" text={formatScheduleDayHours(restaurant)} />
              <Pressable
                style={styles.restaurantContactButton}
                onPress={(event) => {
                  event.stopPropagation();
                  void callRestaurant(restaurant);
                }}
              >
                <Text style={styles.restaurantContactText}>Contacter le restaurant</Text>
              </Pressable>
              {isPaused ? (
                <View style={styles.pauseNoticeCompact}>
                  <Text style={styles.pauseNoticeTitle}>Commandes en pause</Text>
                  <Text style={styles.pauseNoticeText}>Le restaurant consulte le menu, mais ne prend pas de commandes pour le moment.</Text>
                </View>
              ) : null}
              <View style={styles.cardDivider} />
              <View style={styles.rowBetween}>
                <Text style={[styles.cardAction, isPaused && styles.cardActionMuted]}>{restaurant.isOpen ? 'Commander ici' : canReceiveOrders ? 'Précommander ici' : 'Menu uniquement'}</Text>
                <Text style={styles.cardAction}>›</Text>
              </View>
            </View>
          </Pressable>
        );
        })}
      </View>
    </ScrollView>
  );
}

function MenuScreen({
  restaurant,
  selectedCategory,
  setSelectedCategory,
  categories,
  products: menuProducts,
  query,
  setQuery,
  onSelectRestaurant,
  onSelectProduct,
}: {
  restaurant: Restaurant;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  categories: Category[];
  products: Product[];
  query: string;
  setQuery: (query: string) => void;
  onSelectRestaurant: () => void;
  onSelectProduct: (product: Product) => void;
}) {
  const canReceiveOrders = canRestaurantReceiveOrders(restaurant);
  const isPaused = restaurant.acceptingOrders === false;
  const orderLabel = getRestaurantOrderLabel(restaurant);
  return (
    <View style={styles.fill}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.menuContent}>
        <View style={styles.menuHeader}>
          <View style={styles.rowBetween}>
            <Pressable onPress={onSelectRestaurant}>
              <Text style={styles.overline}>RETRAIT À</Text>
              <Text style={styles.menuRestaurant}>⌖ {restaurant.name}⌄</Text>
            </Pressable>
            <View style={[styles.statusPill, isPaused ? styles.pausePill : restaurant.isOpen || canReceiveOrders ? styles.openPill : styles.closedPill]}>
              <Text style={styles.statusText}>{orderLabel}</Text>
            </View>
          </View>
          <Text style={styles.menuTitle}>Notre Menu</Text>
          <Text style={styles.menuSubtitle}>Cuisine traditionnelle marocaine</Text>
          <TextInput
            placeholder="Rechercher un plat..."
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.length ? categories.map((category) => (
            <Pressable
              key={category.id}
              style={[styles.categoryChip, selectedCategory === category.label && styles.categoryChipActive]}
              onPress={() => setSelectedCategory(category.label)}
            >
              <Text style={[styles.categoryLabel, selectedCategory === category.label && styles.categoryLabelActive]}>{category.label}</Text>
            </Pressable>
          )) : <Text style={styles.helperText}>Aucune catégorie disponible pour ce restaurant.</Text>}
        </ScrollView>

        {!restaurant.isOpen && canReceiveOrders ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Le restaurant est actuellement fermé. Vous pouvez précommander maintenant, la commande sera validée par le restaurant au prochain service.
            </Text>
          </View>
        ) : null}
        {!canReceiveOrders ? (
          <View style={[styles.warningBox, styles.pauseWarningBox]}>
            <Text style={styles.pauseWarningTitle}>Commandes en pause</Text>
            <Text style={[styles.warningText, styles.pauseWarningText]}>
              Le restaurant ne prend pas de commandes actuellement. Le menu reste consultable, mais l’ajout au panier est bloqué.
            </Text>
          </View>
        ) : null}

        <View style={styles.productGrid}>
          {menuProducts.map((product) => (
            <Pressable key={product.id} style={[styles.productCard, !product.available && styles.productCardUnavailable]} onPress={() => onSelectProduct(product)}>
              <View style={styles.productBody}>
                <View style={styles.rowBetween}>
                  <Text style={styles.productName}>{product.name}</Text>
                  {!product.available ? <Text style={styles.productUnavailableBadge}>Rupture</Text> : null}
                </View>
                <Text style={styles.productDescription} numberOfLines={2}>{product.description}</Text>
                {product.labels?.length ? (
                  <View style={styles.productTags}>
                    {product.labels.slice(0, 2).map((label) => <Text key={label} style={styles.productTag}>{label}</Text>)}
                  </View>
                ) : null}
                <View style={styles.rowBetween}>
                  <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
                  <View style={[styles.addCircle, !product.available && styles.disabledCircle]}>
                    <Text style={styles.addCircleText}>+</Text>
                  </View>
                </View>
              </View>
              <Image source={{ uri: product.image }} style={[styles.productImage, !product.available && styles.productImageUnavailable]} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ProductSheet({
  product,
  restaurant,
  onClose,
  onAdd,
}: {
  product: Product | null;
  restaurant: Restaurant;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    setQuantity(1);
    setSelectedExtras([]);
    setNote('');
  }, [product?.id]);

  if (!product) {
    return null;
  }

  const total = (product.price + selectedExtras.reduce((sum, extra) => sum + extra.price, 0)) * quantity;
  const canReceiveOrders = canRestaurantReceiveOrders(restaurant);
  const canOrderProduct = product.available && canReceiveOrders;
  const pickupModeText = restaurant.isOpen ? `Retrait ${restaurant.nextSlot}` : 'Précommande à valider par le restaurant';

  const toggleExtra = (extra: Extra) => {
    setSelectedExtras((current) =>
      current.some((selected) => selected.id === extra.id)
        ? current.filter((selected) => selected.id !== extra.id)
        : [...current, extra],
    );
  };

  return (
    <Modal transparent animationType="fade" visible={Boolean(product)} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.productSheet}>
          <ScrollView>
            <Image source={{ uri: product.image }} style={styles.sheetImage} />
            <View style={styles.sheetBody}>
              <View style={styles.rowBetween}>
                <Text style={styles.sheetTitle}>{product.name}</Text>
                <Pressable onPress={onClose} style={styles.iconButton}>
                  <Text style={styles.iconButtonText}>×</Text>
                </Pressable>
              </View>
              <Text style={styles.sheetDescription}>{product.description}</Text>
              <Text style={styles.prepText}>{pickupModeText}</Text>
              {product.labels?.length ? (
                <View style={styles.productTags}>
                  {product.labels.map((label) => <Text key={label} style={styles.productTag}>{label}</Text>)}
                </View>
              ) : null}
              {product.allergens?.length ? (
                <Text style={styles.allergenText}>Allergènes : {product.allergens.join(', ')}</Text>
              ) : (
                <Text style={styles.allergenText}>Allergènes : aucun allergène majeur renseigné</Text>
              )}

              {product.extras.length ? (
                <View style={styles.optionGroup}>
                  <Text style={styles.optionTitle}>Suppléments</Text>
                  {product.extras.map((extra) => {
                    const active = selectedExtras.some((selected) => selected.id === extra.id);
                    return (
                      <Pressable key={extra.id} style={styles.extraRow} onPress={() => toggleExtra(extra)}>
                        <View>
                          <Text style={styles.extraName}>{extra.name}</Text>
                          <Text style={styles.extraPrice}>+ {formatPrice(extra.price)}</Text>
                        </View>
                        <View style={[styles.checkbox, active && styles.checkboxActive]}>
                          <Text style={styles.checkboxText}>{active ? '✓' : ''}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <Text style={styles.optionTitle}>Note spéciale</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Ex : sans coriandre, sauce à part..."
                style={styles.noteInput}
                multiline
              />

              <View style={styles.quantityRow}>
                <Text style={styles.optionTitle}>Quantité</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setQuantity(Math.max(1, quantity - 1))} style={styles.stepperButton}>
                    <Text style={styles.stepperText}>−</Text>
                  </Pressable>
                  <Text style={styles.quantityText}>{quantity}</Text>
                  <Pressable onPress={() => setQuantity(quantity + 1)} style={styles.stepperButton}>
                    <Text style={styles.stepperText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
          <Pressable
            style={[styles.primaryButton, styles.productSheetAction, !canOrderProduct && styles.buttonDisabled]}
            onPress={() => {
              if (!product.available) {
                Alert.alert('Produit indisponible', 'Ce produit est temporairement désactivé par le restaurant.');
                return;
              }
              if (!canReceiveOrders) {
                Alert.alert('Commandes en pause', 'Le restaurant a temporairement désactivé les commandes.');
                return;
              }
              onAdd({ product, quantity, extras: selectedExtras, note });
            }}
          >
            <Text style={styles.primaryButtonText}>
              {canOrderProduct ? `Ajouter au panier · ${formatPrice(total)}` : product.available ? 'Commandes en pause' : 'Produit indisponible'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CartScreen({
  cart,
  coupon,
  discount,
  appliedCouponCode,
  loyaltyDiscount,
  loyaltyCredits,
  useLoyaltyReward,
  setUseLoyaltyReward,
  setCoupon,
  subtotal,
  total,
  accountCreated,
  onMenu,
  onCheckout,
  onQuantity,
}: {
  cart: CartItem[];
  coupon: string;
  discount: number;
  appliedCouponCode: string;
  loyaltyDiscount: number;
  loyaltyCredits: number;
  useLoyaltyReward: boolean;
  setUseLoyaltyReward: (active: boolean) => void;
  setCoupon: (coupon: string) => void;
  subtotal: number;
  total: number;
  accountCreated: boolean;
  onMenu: () => void;
  onCheckout: () => void;
  onQuantity: (index: number, quantity: number) => void;
}) {
  if (!cart.length) {
    return (
      <View style={[styles.fill, styles.clientPageTopInset]}>
        <Header title="Mon Panier" subtitle="0 article" onBack={onMenu} />
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>▢</Text></View>
          <Text style={styles.emptyTitle}>Votre panier est vide</Text>
          <Text style={styles.emptyText}>Ajoutez des plats depuis notre menu</Text>
          <Pressable style={styles.primaryButtonCompact} onPress={onMenu}>
            <Text style={styles.primaryButtonText}>Voir le menu</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.cartContent}>
      <Header title="Mon Panier" subtitle={`${cart.length} article${cart.length > 1 ? 's' : ''}`} onBack={onMenu} />
      {cart.map((item, index) => (
        <View key={`${item.product.id}-${index}`} style={styles.cartItem}>
          <Image source={{ uri: item.product.image }} style={styles.cartImage} />
          <View style={styles.cartInfo}>
            <Text style={styles.cartName}>{item.product.name}</Text>
            {item.extras.length ? <Text style={styles.cartMeta}>{item.extras.map((extra) => extra.name).join(', ')}</Text> : null}
            {item.note ? <Text style={styles.cartMeta}>Note : {item.note}</Text> : null}
            <Text style={styles.productPrice}>{formatPrice(getItemTotal(item))}</Text>
          </View>
          <View style={styles.stepperSmall}>
            <Pressable onPress={() => onQuantity(index, item.quantity - 1)}><Text style={styles.stepperSmallText}>−</Text></Pressable>
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <Pressable onPress={() => onQuantity(index, item.quantity + 1)}><Text style={styles.stepperSmallText}>+</Text></Pressable>
          </View>
        </View>
      ))}

      <View style={styles.summaryCard}>
        <Text style={styles.optionTitle}>Code promo</Text>
        <TextInput value={coupon} onChangeText={setCoupon} placeholder="PROMO10" autoCapitalize="characters" style={styles.input} />
        {loyaltyCredits > 0 ? (
          <Pressable style={styles.loyaltyToggleRow} onPress={() => setUseLoyaltyReward(!useLoyaltyReward)}>
            <View>
              <Text style={styles.extraName}>Utiliser ma récompense fidélité</Text>
              <Text style={styles.cartMeta}>{loyaltyCredits} réduction{loyaltyCredits > 1 ? 's' : ''} de {formatPrice(rewardValue)} disponible{loyaltyCredits > 1 ? 's' : ''}</Text>
            </View>
            <View style={[styles.adminSwitch, useLoyaltyReward && styles.adminSwitchActive]}>
              <View style={[styles.adminSwitchKnob, useLoyaltyReward && styles.adminSwitchKnobActive]} />
            </View>
          </Pressable>
        ) : null}
        <PriceLine label="Sous-total" value={formatPrice(subtotal)} />
        {discount > 0 && appliedCouponCode ? <PriceLine label={`Code promo ${appliedCouponCode}`} value={`-${formatPrice(discount)}`} /> : null}
        {loyaltyDiscount > 0 ? <PriceLine label="Récompense fidélité" value={`-${formatPrice(loyaltyDiscount)}`} /> : null}
        <View style={styles.cardDivider} />
        <PriceLine label="Total à régler au retrait" value={formatPrice(total)} strong />
        <Pressable style={styles.primaryButton} onPress={onCheckout}>
          <Text style={styles.primaryButtonText}>{accountCreated ? 'Continuer' : 'Créer un compte pour commander'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function CheckoutScreen({
  restaurant,
  cart,
  orders,
  profile,
  total,
  pointsEarned,
  discount,
  appliedCouponCode,
  loyaltyDiscount,
  submitting,
  onBack,
  onCreateOrder,
}: {
  restaurant: Restaurant;
  cart: CartItem[];
  orders: Order[];
  profile: ProfileData;
  total: number;
  pointsEarned: number;
  discount: number;
  appliedCouponCode: string;
  loyaltyDiscount: number;
  submitting: boolean;
  onBack: () => void;
  onCreateOrder: (checkout: CheckoutPayload) => void | Promise<void>;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notifyWhenReady, setNotifyWhenReady] = useState(true);
  const slots = useMemo(() => getPickupSlotOptions(restaurant, orders), [restaurant, orders]);
  const selectableSlots = slots.filter((option) => !option.isFull);
  const todayKey = formatLocalDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = formatLocalDate(tomorrowDate);
  const slotDays = useMemo(() => {
    const uniqueDays = new Map<string, string>();
    slots.forEach((option) => {
      if (!uniqueDays.has(option.dateKey)) {
        uniqueDays.set(option.dateKey, option.dayLabel);
      }
    });
    return Array.from(uniqueDays.entries()).map(([dateKey, label]) => ({ dateKey, label }));
  }, [slots]);
  const getInitialSlotMode = (): SlotMode => {
    if (selectableSlots.some((option) => option.dateKey === todayKey)) return 'today';
    if (selectableSlots.some((option) => option.dateKey === tomorrowKey)) return 'tomorrow';
    return 'plan';
  };
  const getDateKeyForMode = (mode: SlotMode) => {
    if (mode === 'today') return todayKey;
    if (mode === 'tomorrow') return tomorrowKey;
    return selectableSlots.find((option) => option.dateKey !== todayKey && option.dateKey !== tomorrowKey)?.dateKey ?? selectableSlots[0]?.dateKey ?? slots[0]?.dateKey ?? todayKey;
  };
  const [slotMode, setSlotMode] = useState<SlotMode>(getInitialSlotMode);
  const [selectedDay, setSelectedDay] = useState(selectableSlots[0]?.dateKey ?? slots[0]?.dateKey ?? formatLocalDate(new Date()));
  const [slot, setSlot] = useState(selectableSlots[0]?.value ?? slots[0]?.value ?? `${formatLocalDate(new Date())} ${restaurant.nextSlot}`);
  const visibleSlots = slots.filter((option) => option.dateKey === selectedDay);
  const planningDays = slotDays.filter((day) => day.dateKey !== todayKey && day.dateKey !== tomorrowKey && selectableSlots.some((option) => option.dateKey === day.dateKey));
  const quickSlotModes: { mode: SlotMode; label: string; dateKey?: string; disabled?: boolean }[] = [
    { mode: 'today', label: "Aujourd'hui", dateKey: todayKey, disabled: !selectableSlots.some((option) => option.dateKey === todayKey) },
    { mode: 'tomorrow', label: 'Demain', dateKey: tomorrowKey, disabled: !selectableSlots.some((option) => option.dateKey === tomorrowKey) },
    { mode: 'plan', label: 'Planifier' },
  ];
  const selectedSlotOption = slots.find((option) => option.value === slot);

  useEffect(() => {
    const nextMode = getInitialSlotMode();
    const nextDay = getDateKeyForMode(nextMode);
    const nextSlot = selectableSlots.find((option) => option.dateKey === nextDay)?.value ?? selectableSlots[0]?.value ?? slots[0]?.value ?? `${formatLocalDate(new Date())} ${restaurant.nextSlot}`;
    setSlotMode(nextMode);
    setSelectedDay(nextDay);
    setSlot(nextSlot);
  }, [restaurant.id, restaurant.nextSlot, slots.length]);

  useEffect(() => {
    if (!profile.accountCreated || !profile.userId) {
      return;
    }
    setFirstName((current) => (current.trim() ? current : profile.firstName.trim()));
    setLastName((current) => (current.trim() ? current : profile.name.trim()));
    setPhone((current) => (current.trim() ? current : profile.phone.trim()));
    setEmail((current) => (current.trim() ? current : profile.email.trim()));
    setAddress((current) => (current.trim() ? current : profile.postalAddress.trim()));
  }, [
    profile.userId,
    profile.accountCreated,
    profile.firstName,
    profile.name,
    profile.phone,
    profile.email,
    profile.postalAddress,
  ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.checkoutContent}>
      <Header title="Validation" subtitle={restaurant.name} onBack={onBack} />
      {!restaurant.isOpen ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Précommande : le restaurant devra accepter la commande avant préparation. Paiement toujours au retrait.
          </Text>
        </View>
      ) : null}
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Informations client</Text>
        <Input label="Prénom" value={firstName} onChangeText={setFirstName} />
        <Input label="Nom" value={lastName} onChangeText={setLastName} />
        <Input label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Input label="Adresse" value={address} onChangeText={setAddress} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Créneau de retrait</Text>
        <View style={styles.slotModeRow}>
          {quickSlotModes.map((item) => (
            <Pressable
              key={item.mode}
              disabled={item.disabled}
              style={[
                styles.slotModeButton,
                slotMode === item.mode && styles.slotModeButtonActive,
                item.disabled && styles.slotButtonDisabled,
              ]}
              onPress={() => {
                const nextDay = getDateKeyForMode(item.mode);
                const firstSlotOfDay = selectableSlots.find((option) => option.dateKey === nextDay);
                setSlotMode(item.mode);
                setSelectedDay(nextDay);
                if (firstSlotOfDay) {
                  setSlot(firstSlotOfDay.value);
                }
              }}
            >
              <Text style={[
                styles.slotModeText,
                slotMode === item.mode && styles.slotModeTextActive,
                item.disabled && styles.slotTextDisabled,
              ]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {slotMode === 'plan' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotDayList}>
            {planningDays.map((day) => (
              <Pressable
                key={day.dateKey}
                style={[styles.slotDayButton, selectedDay === day.dateKey && styles.slotDayButtonActive]}
                onPress={() => {
                  const firstSlotOfDay = selectableSlots.find((option) => option.dateKey === day.dateKey);
                  setSelectedDay(day.dateKey);
                  if (firstSlotOfDay) {
                    setSlot(firstSlotOfDay.value);
                  }
                }}
              >
                <Text style={[styles.slotDayText, selectedDay === day.dateKey && styles.slotDayTextActive]}>{day.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.slotGrid}>
          {visibleSlots.length ? visibleSlots.map((option) => {
            const value = option.value;
            return (
              <Pressable
                key={value}
                disabled={option.isFull}
                style={[styles.slotButton, slot === value && styles.slotButtonActive, option.isFull && styles.slotButtonDisabled]}
                onPress={() => setSlot(value)}
              >
                <Text style={[styles.slotText, slot === value && styles.slotTextActive, option.isFull && styles.slotTextDisabled]}>
                  {option.isFull ? `${option.timeLabel} complet` : option.timeLabel}
                </Text>
              </Pressable>
            );
          }) : <Text style={styles.helperText}>Aucun créneau disponible pour ce jour.</Text>}
        </View>
        <Text style={styles.helperText}>
          Réservation possible jusqu'à 7 jours à l'avance. Capacité : {restaurant.capacityPerSlot} commandes par tranche de 30 min.
        </Text>
        <Pressable style={styles.checkoutOptionRow} onPress={() => setNotifyWhenReady((current) => !current)}>
          <View style={[styles.checkbox, notifyWhenReady && styles.checkboxActive]}>
            <Text style={styles.checkboxText}>{notifyWhenReady ? '✓' : ''}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.optionTitle}>Prévenir quand ma commande est prête</Text>
            <Text style={styles.helperText}>Une notification sera envoyée quand la cuisine passe la commande en Prête.</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Résumé</Text>
        {cart.map((item, index) => (
          <PriceLine key={`${item.product.id}-${index}`} label={`${item.quantity}x ${item.product.name}`} value={formatPrice(getItemTotal(item))} />
        ))}
        {discount > 0 && appliedCouponCode ? <PriceLine label={`Code promo ${appliedCouponCode}`} value={`-${formatPrice(discount)}`} /> : null}
        {loyaltyDiscount > 0 ? <PriceLine label="Récompense fidélité" value={`-${formatPrice(loyaltyDiscount)}`} /> : null}
        <PriceLine label="Points après commande terminée" value={`${pointsEarned} point${pointsEarned > 1 ? 's' : ''}`} />
        <View style={styles.cardDivider} />
        <PriceLine label="Total à régler au retrait" value={formatPrice(total)} strong />
        <Pressable
          disabled={submitting}
          style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
          onPress={() => {
            if (!firstName || !phone || !email) {
              Alert.alert('Informations manquantes', 'Merci de renseigner au minimum le prénom, le téléphone et l’email.');
              return;
            }
            if (!selectedSlotOption || selectedSlotOption.isFull) {
              Alert.alert('Créneau indisponible', 'Choisis un autre créneau de retrait.');
              return;
            }
            void onCreateOrder({ pickupAt: slot, firstName, lastName, phone, email, address, notifyWhenReady });
          }}
        >
          <Text style={styles.primaryButtonText}>{submitting ? 'Envoi en cuisine...' : 'Valider la commande'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function OrdersScreen({
  orders,
  reviewedOrderIds,
  accountCreated,
  currentUserId,
  onOpenProfile,
  onReorder,
  onTrack,
  onReview,
}: {
  orders: Order[];
  reviewedOrderIds: string[];
  accountCreated: boolean;
  currentUserId?: string;
  onOpenProfile: () => void;
  onReorder: (order: Order) => void;
  onTrack: (order: Order) => void;
  onReview: (order: Order) => void;
}) {
  const reviewed = new Set(reviewedOrderIds);
  const visibleOrders = accountCreated
    ? orders.filter((order) => Boolean(currentUserId) && order.userId === currentUserId)
    : orders.filter((order) => !order.userId);
  if (visibleOrders.length === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.ordersContent}>
        <Text style={styles.pageTitle}>Historique des commandes</Text>
        <Text style={styles.ordersEmptyText}>
          {accountCreated
            ? 'Tu n’as pas encore de commande sur ce compte. Lance une commande depuis le menu.'
            : 'Connecte-toi pour retrouver toutes tes commandes. Sans compte, seules les commandes enregistrées sur cet appareil (web) s’affichent ici.'}
        </Text>
        {!accountCreated ? (
          <Pressable style={styles.primaryButton} onPress={onOpenProfile}>
            <Text style={styles.primaryButtonText}>Profil · connexion</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.ordersContent}>
      <Text style={styles.pageTitle}>Historique des commandes</Text>
      {visibleOrders.map((order) => {
        const couponDiscount = getOrderCouponDiscount(order);
        return (
        <View key={order.id} style={styles.orderCard}>
          <View style={styles.orderCardHeader}>
            <View style={styles.orderHeaderText}>
              <Text style={styles.orderId} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{order.id}</Text>
              <Text style={styles.orderDate} numberOfLines={1}>{order.createdAt}</Text>
            </View>
            <View style={[styles.orderBadge, order.status === 'Annulée' && styles.cancelBadge]}>
              <Text style={[styles.orderBadgeText, order.status === 'Annulée' && styles.cancelBadgeText]} numberOfLines={1}>{order.status}</Text>
            </View>
          </View>
          <Text style={styles.orderMeta} numberOfLines={2}>{getRestaurant(order.restaurantId).name} · Retrait {order.pickupAt}</Text>
          <Text style={styles.orderItems} numberOfLines={2}>{order.items.map((item) => `${item.quantity}x ${item.product.name}`).join(', ')}</Text>
          {couponDiscount > 0 ? <Text style={styles.orderMeta} numberOfLines={1}>Code promo {order.couponCode} : -{formatPrice(couponDiscount)}</Text> : null}
          <View style={styles.cardDivider} />
          <View style={styles.orderFooter}>
            <Text style={styles.orderTotal} numberOfLines={1}>{formatPrice(order.total)}</Text>
            <View style={styles.orderInlineActions}>
              <Pressable style={[styles.secondaryButton, styles.orderActionButton]} onPress={() => onReorder(order)}>
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>↻ Recommander</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.orderActionButton]} onPress={() => onTrack(order)}>
                <Text style={styles.actionButtonText} numberOfLines={1}>Suivre ›</Text>
              </Pressable>
              {order.status === 'Terminée' && !reviewed.has(order.id) ? (
                <Pressable style={[styles.secondaryButton, styles.orderActionButton]} onPress={() => onReview(order)}>
                  <Text style={styles.secondaryButtonText} numberOfLines={1}>Noter</Text>
                </Pressable>
              ) : null}
              {order.status === 'Terminée' && reviewed.has(order.id) ? (
                <Text style={styles.orderReviewedLabel}>Avis envoyé</Text>
              ) : null}
            </View>
          </View>
        </View>
        );
      })}
    </ScrollView>
  );
}

function TrackingScreen({ order, onBack, onCancel }: { order: Order; onBack: () => void; onCancel: () => void }) {
  const currentIndex = orderSteps.indexOf(order.status);
  const restaurant = getRestaurant(order.restaurantId);
  const couponDiscount = getOrderCouponDiscount(order);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.checkoutContent}>
      <Header title="Suivi de commande" subtitle={order.id} onBack={onBack} />
      <View style={styles.summaryCard}>
        <Text style={styles.restaurantName}>{restaurant.name}</Text>
        <Text style={styles.orderMeta}>Retrait prévu : {order.pickupAt}</Text>
        {order.estimatedPrepMinutes ? <Text style={styles.orderMeta}>Temps estimé : {order.estimatedPrepMinutes} min</Text> : null}
        {couponDiscount > 0 ? <Text style={styles.orderMeta}>Code promo {order.couponCode} : -{formatPrice(couponDiscount)}</Text> : null}
        {order.loyaltyDiscount && order.loyaltyDiscount > 0 ? <Text style={styles.orderMeta}>Récompense fidélité : -{formatPrice(order.loyaltyDiscount)}</Text> : null}
        <Text style={styles.orderTotal}>{formatPrice(order.total)} · Paiement au retrait</Text>
        <Pressable style={styles.restaurantContactButton} onPress={() => void callRestaurant(restaurant)}>
          <Text style={styles.restaurantContactText}>Contacter le restaurant</Text>
        </Pressable>
      </View>
      {order.status === 'Nouvelle' ? (
        <View style={styles.cancelOrderCard}>
          <View style={styles.flex}>
            <Text style={styles.cancelOrderTitle}>Commande en attente de validation</Text>
            <Text style={styles.cancelOrderText}>Vous pouvez encore l’annuler tant que le restaurant ne l’a pas acceptée.</Text>
          </View>
          <Pressable style={styles.cancelOrderButton} onPress={onCancel}>
            <Text style={styles.cancelOrderButtonText}>Annuler ma commande</Text>
          </Pressable>
        </View>
      ) : null}
      {order.status === 'Annulée' ? (
        <View style={[styles.warningBox, styles.pauseWarningBox]}>
          <Text style={styles.pauseWarningTitle}>Commande annulée ou refusée</Text>
          <Text style={[styles.warningText, styles.pauseWarningText]}>{order.refusalReason || 'Le restaurant ne peut pas préparer cette commande.'}</Text>
        </View>
      ) : null}
      {order.status === 'Prête' ? (
        <View style={styles.readyDirectionsCard}>
          <View style={styles.flex}>
            <Text style={styles.cancelOrderTitle}>Votre commande est prête</Text>
            <Text style={styles.cancelOrderText}>{restaurant.address}</Text>
          </View>
          <Pressable style={styles.readyDirectionsButton} onPress={() => void openRestaurantDirections(restaurant)}>
            <Text style={styles.readyDirectionsButtonText}>Aller au restaurant</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.timelineCard}>
        {orderSteps.map((step, index) => {
          const done = currentIndex >= index && currentIndex !== -1;
          return (
            <View key={step} style={styles.timelineRow}>
              <View style={[styles.timelineDot, done && styles.timelineDotActive]} />
              <View style={styles.timelineTextWrap}>
                <Text style={[styles.timelineTitle, done && styles.timelineTitleActive]}>{step}</Text>
                <Text style={styles.timelineDescription}>{getTimelineCopy(step)}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Articles</Text>
        {order.items.map((item, index) => (
          <PriceLine key={`${item.product.id}-${index}`} label={`${item.quantity}x ${item.product.name}`} value={formatPrice(getItemTotal(item))} />
        ))}
        {couponDiscount > 0 ? <PriceLine label={`Code promo ${order.couponCode}`} value={`-${formatPrice(couponDiscount)}`} /> : null}
        {order.loyaltyDiscount && order.loyaltyDiscount > 0 ? <PriceLine label="Récompense fidélité" value={`-${formatPrice(order.loyaltyDiscount)}`} /> : null}
        <View style={styles.cardDivider} />
        <PriceLine label="Total" value={formatPrice(order.total)} strong />
      </View>
    </ScrollView>
  );
}

function ProfileScreen({
  loyalty,
  profile,
  setProfile,
  restaurants,
  onOrders,
  onPreferredRestaurant,
  onCreateAccount,
  onSignInCustomer,
  onSignOutCustomer,
  onSaveProfile,
  onDeleteAccount,
  onClaimLoyaltyReward,
  onRequestPasswordReset,
}: {
  loyalty: LoyaltyState;
  profile: ProfileData;
  setProfile: (profile: StoredState<ProfileData>) => void;
  restaurants: Restaurant[];
  onOrders: () => void;
  onPreferredRestaurant: (restaurantId: string) => void;
  onCreateAccount: (payload: CustomerAccountPayload) => Promise<CustomerAccountCreateResult>;
  onSignInCustomer: (email: string, password: string) => Promise<boolean>;
  onSignOutCustomer: () => Promise<void>;
  onSaveProfile: (profile: ProfileData) => Promise<boolean>;
  onDeleteAccount: () => Promise<boolean>;
  onClaimLoyaltyReward: () => Promise<{ ok: boolean; error?: string }>;
  onRequestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [postalAddress, setPostalAddress] = useState(profile.postalAddress);
  const [preferredRestaurantId, setPreferredRestaurantId] = useState(profile.preferredRestaurantId);
  const [marketingConsent, setMarketingConsent] = useState(profile.marketingConsent);
  const [marketingPushConsent, setMarketingPushConsent] = useState(profile.marketingPushConsent);
  const [password, setPassword] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [registerFeedback, setRegisterFeedback] = useState<{ variant: 'error' | 'success'; text: string } | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ variant: 'error' | 'success'; text: string } | null>(null);
  const [accountMode, setAccountMode] = useState<'login' | 'register'>(profile.accountCreated ? 'login' : 'login');
  useEffect(() => {
    setFirstName(profile.firstName);
    setName(profile.name);
    setEmail(profile.email);
    setPhone(profile.phone);
    setPostalAddress(profile.postalAddress);
    setPreferredRestaurantId(profile.preferredRestaurantId);
  }, [profile.userId]);
  useEffect(() => {
    setMarketingConsent(profile.marketingConsent);
    setMarketingPushConsent(profile.marketingPushConsent);
  }, [profile.marketingConsent, profile.marketingPushConsent, profile.userId]);
  const progressPoints = Math.min(loyalty.points, rewardThreshold);
  const progressPercent = `${Math.min(100, (progressPoints / rewardThreshold) * 100)}%` as DimensionValue;
  const canClaimReward = loyalty.points >= rewardThreshold;
  const claimReward = async () => {
    if (!canClaimReward) {
      Alert.alert('Récompense non disponible', `Il faut ${rewardThreshold} points pour obtenir ${formatPrice(rewardValue)} de réduction.`);
      return;
    }
    const res = await onClaimLoyaltyReward();
    if (res.ok) {
      Alert.alert('Récompense réclamée', `${formatPrice(rewardValue)} de réduction seront appliqués à la prochaine commande.`);
    } else {
      Alert.alert('Fidélité', res.error ?? 'Réclamation impossible.');
    }
  };
  const sendPasswordReset = async () => {
    setResetBusy(true);
    setResetMessage(null);
    const res = await onRequestPasswordReset(resetEmail);
    setResetBusy(false);
    if (res.ok) {
      setResetMessage({
        variant: 'success',
        text: 'Si un compte existe pour cet email, un lien de réinitialisation vient d’être envoyé. Vérifie ta boîte mail (et les indésirables).',
      });
    } else {
      setResetMessage({ variant: 'error', text: res.error ?? 'Demande impossible.' });
    }
  };
  const saveProfile = async () => {
    const nextProfile = {
      ...profile,
      firstName,
      name,
      email: email.trim().toLowerCase(),
      phone,
      postalAddress,
      preferredRestaurantId,
      marketingConsent,
      marketingPushConsent,
    };
    const saved = await onSaveProfile(nextProfile);
    if (!saved) {
      return;
    }
    onPreferredRestaurant(preferredRestaurantId);
    Alert.alert('Profil enregistré', 'Adresse postale et restaurant préféré sauvegardés.');
  };
  const createAccount = async () => {
    setRegisterFeedback(null);
    if (!firstName.trim() || !name.trim() || !email.trim() || !password) {
      setRegisterFeedback({
        variant: 'error',
        text: 'Renseigne le prénom, le nom, l’email et un mot de passe.',
      });
      return;
    }
    if (password.length < 6) {
      setRegisterFeedback({ variant: 'error', text: 'Utilise au minimum 6 caractères pour le mot de passe.' });
      return;
    }
    setAccountLoading(true);
    const result = await onCreateAccount({
      firstName,
      name,
      email,
      password,
      phone,
      postalAddress,
      preferredRestaurantId,
      marketingConsent,
      marketingPushConsent,
    });
    setAccountLoading(false);
    if (result.ok) {
      setPassword('');
      setRegisterFeedback({ variant: 'success', text: result.successMessage });
    } else {
      setRegisterFeedback({ variant: 'error', text: result.error });
    }
  };
  const loginAccount = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Connexion incomplète', 'Renseigne l’email et le mot de passe.');
      return;
    }
    setAccountLoading(true);
    const connected = await onSignInCustomer(email, password);
    setAccountLoading(false);
    if (connected) {
      setPassword('');
    }
  };
  const logoutAccount = () => {
    setPassword('');
    void onSignOutCustomer();
  };
  const requestDeleteAccount = () => {
    const deleteAction = () => void onDeleteAccount();
    if (Platform.OS === 'web') {
      if (window.confirm('Supprimer définitivement votre compte client ?')) {
        deleteAction();
      }
      return;
    }
    Alert.alert(
      'Supprimer le compte',
      'Cette action supprime définitivement le compte client.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: deleteAction },
      ],
    );
  };

  const passwordResetModal = (
    <Modal transparent animationType="fade" visible={resetModalVisible} onRequestClose={() => setResetModalVisible(false)}>
      <View style={styles.cartChoiceBackdrop}>
        <View style={styles.cartChoiceCard}>
          <Text style={styles.cartChoiceTitle}>Mot de passe oublié</Text>
          <Text style={styles.helperText}>Indique l’email du compte : tu recevras un lien pour choisir un nouveau mot de passe.</Text>
          <Input label="Email" value={resetEmail} onChangeText={setResetEmail} keyboardType="email-address" />
          {resetMessage ? (
            <View
              style={[
                styles.formBanner,
                resetMessage.variant === 'error' ? styles.formBannerError : styles.formBannerSuccess,
              ]}
            >
              <Text
                style={resetMessage.variant === 'error' ? styles.formBannerErrorText : styles.formBannerSuccessText}
              >
                {resetMessage.text}
              </Text>
            </View>
          ) : null}
          <View style={styles.cartChoiceActions}>
            <Pressable style={styles.secondaryButton} onPress={() => setResetModalVisible(false)} disabled={resetBusy}>
              <Text style={styles.secondaryButtonText}>Fermer</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, resetBusy && styles.buttonDisabled]} onPress={() => void sendPasswordReset()} disabled={resetBusy}>
              <Text style={styles.primaryButtonText}>{resetBusy ? 'Envoi…' : 'Envoyer le lien'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!profile.accountCreated) {
    return (
      <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.profileContent}>
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Compte client</Text>
          <Text style={styles.helperText}>Connectez-vous si vous avez déjà un compte, ou inscrivez-vous avant de commander.</Text>
          <View style={styles.accountModeTabs}>
            <Pressable
              style={[styles.accountModeTab, accountMode === 'login' && styles.accountModeTabActive]}
              onPress={() => {
                setAccountMode('login');
                setRegisterFeedback(null);
              }}
            >
              <Text style={[styles.accountModeText, accountMode === 'login' && styles.accountModeTextActive]}>Se connecter</Text>
            </Pressable>
            <Pressable
              style={[styles.accountModeTab, accountMode === 'register' && styles.accountModeTabActive]}
              onPress={() => {
                setAccountMode('register');
                setRegisterFeedback(null);
              }}
            >
              <Text style={[styles.accountModeText, accountMode === 'register' && styles.accountModeTextActive]}>S’inscrire</Text>
            </Pressable>
          </View>
          {accountMode === 'register' ? (
            <>
              <Input label="Prénom" value={firstName} onChangeText={setFirstName} />
              <Input label="Nom" value={name} onChangeText={setName} />
            </>
          ) : null}
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          {accountMode === 'register' ? (
            <>
              <Input label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Input label="Adresse postale" value={postalAddress} onChangeText={setPostalAddress} />
              <Text style={styles.inputLabel}>Restaurant préféré</Text>
              <View style={styles.profileRestaurantChoices}>
                {restaurants.map((restaurant) => (
                  <Pressable
                    key={restaurant.id}
                    style={[styles.profileRestaurantChoice, preferredRestaurantId === restaurant.id && styles.profileRestaurantChoiceActive]}
                    onPress={() => setPreferredRestaurantId(restaurant.id)}
                  >
                    <Text style={[styles.profileRestaurantName, preferredRestaurantId === restaurant.id && styles.profileRestaurantNameActive]}>
                      {restaurant.name.replace('Allo Couscous ', '')}
                    </Text>
                    <Text style={[styles.profileRestaurantMeta, preferredRestaurantId === restaurant.id && styles.profileRestaurantNameActive]}>
                      {restaurant.isOpen ? 'Ouvert' : `Rouvre à ${restaurant.nextSlot}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              autoCapitalize="none"
            />
          </View>
          {accountMode === 'login' ? (
            <Pressable
              style={styles.profileForgotPassword}
              onPress={() => {
                setResetEmail(email.trim());
                setResetMessage(null);
                setResetModalVisible(true);
              }}
            >
              <Text style={styles.profileForgotPasswordText}>Mot de passe oublié ?</Text>
            </Pressable>
          ) : null}
          {accountMode === 'register' ? (
            <>
              <Pressable style={styles.checkoutOptionRow} onPress={() => setMarketingConsent((current) => !current)}>
                <View style={[styles.checkbox, marketingConsent && styles.checkboxActive]}>
                  <Text style={styles.checkboxText}>{marketingConsent ? '✓' : ''}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>J’accepte de recevoir les offres par email</Text>
                  <Text style={styles.helperText}>Ce consentement sert uniquement aux emails publicitaires.</Text>
                </View>
              </Pressable>
              <Pressable style={styles.checkoutOptionRow} onPress={() => setMarketingPushConsent((current) => !current)}>
                <View style={[styles.checkbox, marketingPushConsent && styles.checkboxActive]}>
                  <Text style={styles.checkboxText}>{marketingPushConsent ? '✓' : ''}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>J’accepte les notifications push pour les offres et actus</Text>
                  <Text style={styles.helperText}>Uniquement sur l’application mobile (iPhone / Android), pas sur le site web.</Text>
                </View>
              </Pressable>
              {registerFeedback ? (
                <View
                  style={[
                    styles.formBanner,
                    registerFeedback.variant === 'error' ? styles.formBannerError : styles.formBannerSuccess,
                  ]}
                >
                  <Text
                    style={
                      registerFeedback.variant === 'error' ? styles.formBannerErrorText : styles.formBannerSuccessText
                    }
                  >
                    {registerFeedback.text}
                  </Text>
                </View>
              ) : null}
              <Pressable style={[styles.primaryButton, accountLoading && styles.buttonDisabled]} onPress={() => void createAccount()}>
                <Text style={styles.primaryButtonText}>{accountLoading ? 'Création...' : 'Créer mon compte'}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={[styles.primaryButton, accountLoading && styles.buttonDisabled]} onPress={() => void loginAccount()}>
              <Text style={styles.primaryButtonText}>{accountLoading ? 'Connexion...' : 'Se connecter'}</Text>
            </Pressable>
          )}
        </View>
        {getPrivacyPolicyUrl() ? (
          <Pressable style={styles.profileLink} onPress={() => void openPrivacyPolicyUrl()}>
            <Text style={styles.profileLinkText}>Politique de confidentialité</Text>
            <Text style={styles.profileLinkText}>›</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {passwordResetModal}
      </>
    );
  }

  return (
    <>
    <ScrollView style={styles.screen} contentContainerStyle={styles.profileContent}>
      <View style={styles.profileHero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
        <Text style={styles.profileName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{getProfileDisplayName(profile)}</Text>
        <Text style={styles.profileEmail} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{profile.email}</Text>
      </View>

      <View style={styles.loyaltyCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.loyaltyTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>★ Fidélité</Text>
          <Text style={styles.loyaltyPoints} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>{loyalty.points}</Text>
        </View>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: progressPercent }]} /></View>
        <View style={styles.rowBetween}>
          <Text style={styles.loyaltyMuted} numberOfLines={1}>{progressPoints}/{rewardThreshold} points</Text>
          <Text style={styles.loyaltyMuted} numberOfLines={1}>{rewardThreshold} pts = {formatPrice(rewardValue)}</Text>
        </View>
        <Pressable style={[styles.rewardButton, !canClaimReward && styles.rewardButtonDisabled]} onPress={() => void claimReward()}>
          <Text style={styles.rewardButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Réclamer ma récompense</Text>
        </Pressable>
        <View style={styles.darkDivider} />
        <View style={styles.rowBetween}>
          <Text style={styles.loyaltyMuted} numberOfLines={1}>{loyalty.rewardsClaimed} récompense{loyalty.rewardsClaimed > 1 ? 's' : ''}</Text>
          <Text style={styles.loyaltyMuted} numberOfLines={1}>{Math.round(loyalty.totalSpent)}€ dépensés</Text>
        </View>
        {loyalty.rewardCredits > 0 ? <Text style={styles.loyaltyMuted}>{loyalty.rewardCredits} réduction de {formatPrice(rewardValue)} disponible</Text> : null}
      </View>

      {!profile.accountCreated ? (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Compte client</Text>
          <Text style={styles.helperText}>Connectez-vous si vous avez déjà un compte, ou inscrivez-vous avant de commander.</Text>
          <View style={styles.accountModeTabs}>
            <Pressable
              style={[styles.accountModeTab, accountMode === 'login' && styles.accountModeTabActive]}
              onPress={() => setAccountMode('login')}
            >
              <Text style={[styles.accountModeText, accountMode === 'login' && styles.accountModeTextActive]}>Se connecter</Text>
            </Pressable>
            <Pressable
              style={[styles.accountModeTab, accountMode === 'register' && styles.accountModeTabActive]}
              onPress={() => setAccountMode('register')}
            >
              <Text style={[styles.accountModeText, accountMode === 'register' && styles.accountModeTextActive]}>S’inscrire</Text>
            </Pressable>
          </View>
          {accountMode === 'register' ? (
            <>
              <Input label="Prénom" value={firstName} onChangeText={setFirstName} />
              <Input label="Nom" value={name} onChangeText={setName} />
            </>
          ) : null}
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              autoCapitalize="none"
            />
          </View>
          {accountMode === 'register' ? (
            <>
              <Pressable style={styles.checkoutOptionRow} onPress={() => setMarketingConsent((current) => !current)}>
                <View style={[styles.checkbox, marketingConsent && styles.checkboxActive]}>
                  <Text style={styles.checkboxText}>{marketingConsent ? '✓' : ''}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>J’accepte de recevoir les offres par email</Text>
                  <Text style={styles.helperText}>Ce consentement sert uniquement aux emails publicitaires.</Text>
                </View>
              </Pressable>
              <Pressable style={styles.checkoutOptionRow} onPress={() => setMarketingPushConsent((current) => !current)}>
                <View style={[styles.checkbox, marketingPushConsent && styles.checkboxActive]}>
                  <Text style={styles.checkboxText}>{marketingPushConsent ? '✓' : ''}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>J’accepte les notifications push pour les offres et actus</Text>
                  <Text style={styles.helperText}>Uniquement sur l’application mobile (iPhone / Android), pas sur le site web.</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.primaryButton, accountLoading && styles.buttonDisabled]} onPress={() => void createAccount()}>
                <Text style={styles.primaryButtonText}>{accountLoading ? 'Création...' : 'Créer mon compte'}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={[styles.primaryButton, accountLoading && styles.buttonDisabled]} onPress={() => void loginAccount()}>
              <Text style={styles.primaryButtonText}>{accountLoading ? 'Connexion...' : 'Se connecter'}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Mon profil</Text>
        <Input label="Prénom" value={firstName} onChangeText={setFirstName} />
        <Input label="Nom" value={name} onChangeText={setName} />
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Input label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Input label="Adresse postale" value={postalAddress} onChangeText={setPostalAddress} />
        <Text style={styles.inputLabel}>Restaurant préféré</Text>
        <View style={styles.profileRestaurantChoices}>
          {restaurants.map((restaurant) => (
            <Pressable
              key={restaurant.id}
              style={[styles.profileRestaurantChoice, preferredRestaurantId === restaurant.id && styles.profileRestaurantChoiceActive]}
              onPress={() => setPreferredRestaurantId(restaurant.id)}
            >
              <Text style={[styles.profileRestaurantName, preferredRestaurantId === restaurant.id && styles.profileRestaurantNameActive]}>
                {restaurant.name.replace('Allo Couscous ', '')}
              </Text>
              <Text style={[styles.profileRestaurantMeta, preferredRestaurantId === restaurant.id && styles.profileRestaurantNameActive]}>
                {restaurant.isOpen ? 'Ouvert' : `Rouvre à ${restaurant.nextSlot}`}
              </Text>
            </Pressable>
          ))}
        </View>
        {profile.accountCreated ? (
          <>
            <Pressable style={styles.checkoutOptionRow} onPress={() => setMarketingConsent((current) => !current)}>
              <View style={[styles.checkbox, marketingConsent && styles.checkboxActive]}>
                <Text style={styles.checkboxText}>{marketingConsent ? '✓' : ''}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>J’accepte de recevoir les offres par email</Text>
                <Text style={styles.helperText}>Ce consentement sert uniquement aux emails publicitaires.</Text>
              </View>
            </Pressable>
            <Pressable style={styles.checkoutOptionRow} onPress={() => setMarketingPushConsent((current) => !current)}>
              <View style={[styles.checkbox, marketingPushConsent && styles.checkboxActive]}>
                <Text style={styles.checkboxText}>{marketingPushConsent ? '✓' : ''}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>J’accepte les notifications push pour les offres et actus</Text>
                <Text style={styles.helperText}>Active les campagnes offres uniquement sur l’application mobile installée.</Text>
              </View>
            </Pressable>
          </>
        ) : null}
        <Pressable style={styles.primaryButton} onPress={() => void saveProfile()}>
          <Text style={styles.primaryButtonText}>Enregistrer</Text>
        </Pressable>
      </View>

      {profile.accountCreated ? (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Compte client</Text>
          <Text style={styles.helperText}>Connecté avec {profile.email || 'un compte client'}.</Text>
          <>
            <Pressable style={styles.secondaryButton} onPress={logoutAccount}>
              <Text style={styles.secondaryButtonText}>Se déconnecter</Text>
            </Pressable>
            <Pressable style={styles.deleteAccountButton} onPress={requestDeleteAccount}>
              <Text style={styles.deleteAccountButtonText}>Supprimer mon compte</Text>
            </Pressable>
          </>
        </View>
      ) : null}

      <Pressable style={styles.profileLink} onPress={onOrders}>
        <Text style={styles.profileLinkText}>Historique des commandes</Text>
        <Text style={styles.profileLinkText}>›</Text>
      </Pressable>
      {getPrivacyPolicyUrl() ? (
        <Pressable style={styles.profileLink} onPress={() => void openPrivacyPolicyUrl()}>
          <Text style={styles.profileLinkText}>Politique de confidentialité</Text>
          <Text style={styles.profileLinkText}>›</Text>
        </Pressable>
      ) : null}
    </ScrollView>
    {passwordResetModal}
    </>
  );
}

function AdminAuthLoadingScreen() {
  return (
    <View style={styles.adminLoginScreen}>
      <View style={styles.adminLoginCard}>
        <Text style={styles.adminLoginTitle}>Allo Couscous Admin</Text>
        <Text style={styles.adminLoginText}>Vérification de la session...</Text>
      </View>
    </View>
  );
}

function AdminLoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Connexion incomplète', 'Renseigne l’email admin et le mot de passe.');
      return;
    }
    setLoading(true);
    await onLogin(email.trim(), password);
    setLoading(false);
  };

  return (
    <View style={styles.adminLoginScreen}>
      <View style={styles.adminLoginCard}>
        <Text style={styles.adminLoginTitle}>Allo Couscous Admin</Text>
        <Text style={styles.adminLoginText}>Connexion réservée aux comptes admin, cuisine ou manager.</Text>
        <AdminField label="Email" value={email} onChangeText={setEmail} />
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Mot de passe</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
        <Pressable style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={() => void submit()}>
          <Text style={styles.primaryButtonText}>{loading ? 'Connexion...' : 'Se connecter'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminScreen({
  tab,
  setTab,
  adminProfile,
  orders,
  reviews,
  setOrders,
  onOrderStatusPersist,
  onOrdersRefresh,
  onReviewsRefresh,
  products,
  setProducts,
  onProductPersist,
  onProductDelete,
  categories,
  setCategories,
  onCategoryPersist,
  onCategoryDelete,
  coupon,
  setCoupon,
  onCouponPersist,
  offers,
  setOffers,
  onOfferPersist,
  onOfferDelete,
  restaurants,
  setRestaurants,
  onRestaurantPersist,
  pushCampaigns,
  setPushCampaigns,
  offerPushCampaigns,
  setOfferPushCampaigns,
  pushDiagnostics,
  onMarketingEmail,
  onMarketingPush,
  onPushRefresh,
  onExit,
  onSignOut,
}: {
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
  adminProfile: AdminProfile;
  orders: Order[];
  reviews: Review[];
  setOrders: (orders: Order[]) => void;
  onOrderStatusPersist: (orderId: string, status: OrderStatus, updates?: Partial<Order>) => Promise<void>;
  onOrdersRefresh: () => Promise<void>;
  onReviewsRefresh: () => Promise<void>;
  products: Product[];
  setProducts: (products: Product[]) => void;
  onProductPersist: (product: Product) => Promise<void>;
  onProductDelete: (productId: string) => Promise<void>;
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  onCategoryPersist: (category: Category, index: number) => Promise<void>;
  onCategoryDelete: (categoryId: string) => Promise<void>;
  coupon: CouponConfig;
  setCoupon: (coupon: CouponConfig) => void;
  onCouponPersist: (coupon: CouponConfig) => Promise<void>;
  offers: OfferConfig[];
  setOffers: (offers: OfferConfig[]) => void;
  onOfferPersist: (offer: OfferConfig) => Promise<void>;
  onOfferDelete: (offerId: string) => Promise<void>;
  restaurants: Restaurant[];
  setRestaurants: (restaurants: Restaurant[]) => void;
  onRestaurantPersist: (restaurant: Restaurant) => Promise<void>;
  pushCampaigns: PushCampaign[];
  setPushCampaigns: (campaigns: PushCampaign[]) => void;
  offerPushCampaigns: OfferPushCampaign[];
  setOfferPushCampaigns: (campaigns: OfferPushCampaign[]) => void;
  pushDiagnostics: PushDiagnostics | null;
  onMarketingEmail: (campaign: PushCampaign) => Promise<boolean>;
  onMarketingPush: (campaign: OfferPushCampaign) => Promise<CampaignSendResult>;
  onPushRefresh: (silent?: boolean) => Promise<void>;
  onExit: () => void;
  onSignOut: () => Promise<void>;
}) {
  const tabs = useMemo<AdminTab[]>(
    () => (adminProfile.role === 'kitchen' ? KITCHEN_ADMIN_TABS : ALL_ADMIN_TABS),
    [adminProfile.role],
  );
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  useEffect(() => {
    if (!tabs.includes(tab)) {
      setTab(tabs[0]);
    }
  }, [setTab, tab, tabs]);
  const activeOrders = orders.filter((order) => !['Terminée', 'Annulée'].includes(order.status)).length;
  return (
    <View style={styles.adminScreen}>
      <View style={styles.adminDesktopLayout}>
        <View style={styles.adminSidebar}>
          <Pressable onPress={onExit} style={styles.adminBrandBlock}>
            <View style={styles.adminBrandIcon}><Text style={styles.adminBrandIconText}>AC</Text></View>
            <View style={styles.adminBrandTexts}>
              <Text style={styles.adminBrand}>Allo Couscous</Text>
              <Text style={styles.adminBrandSubtitle}>Back-office</Text>
            </View>
          </Pressable>
          <View style={styles.adminSidebarNav}>
            {tabs.map((item) => (
              <Pressable key={item} style={[styles.adminTab, activeTab === item && styles.adminTabActive]} onPress={() => setTab(item)}>
                <Text style={[styles.adminTabText, activeTab === item && styles.adminTabTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.adminSidebarFooter}>
            <Text style={styles.adminAccountLabel}>Connecté</Text>
            <Text style={styles.adminAccountText}>{adminProfile.email}</Text>
            <Pressable style={styles.adminLogoutButton} onPress={onSignOut}>
              <Text style={styles.adminLogoutText}>Déconnexion</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.adminMain}>
          <View style={styles.adminHeaderBar}>
            <View>
              <Text style={styles.adminEyebrow}>Console d’administration</Text>
              <Text style={styles.adminPageTitle}>{activeTab}</Text>
            </View>
            <View style={styles.adminHeaderStatus}>
              <Text style={styles.adminHeaderStatusDot}>●</Text>
              <Text style={styles.adminHeaderStatusText}>Supabase connecté</Text>
            </View>
          </View>
          <ScrollView style={styles.adminBody} contentContainerStyle={styles.adminBodyContent}>
            <View style={styles.adminPageHero}>
              <View style={styles.adminPageHeroText}>
                <Text style={styles.adminPageDescription}>{getAdminTabDescription(activeTab)}</Text>
              </View>
              <View style={styles.adminHeroStats}>
                <View style={styles.adminHeroStat}>
                  <Text style={styles.adminHeroStatValue}>{activeOrders}</Text>
                  <Text style={styles.adminHeroStatLabel}>commandes actives</Text>
                </View>
                <View style={styles.adminHeroStat}>
                  <Text style={styles.adminHeroStatValue}>{products.length}</Text>
                  <Text style={styles.adminHeroStatLabel}>produits</Text>
                </View>
                <View style={styles.adminHeroStat}>
                  <Text style={styles.adminHeroStatValue}>{offers.filter((offer) => offer.active).length}</Text>
                  <Text style={styles.adminHeroStatLabel}>offres actives</Text>
                </View>
              </View>
            </View>
            {activeTab === 'Cuisine' ? <KitchenAdmin orders={orders} setOrders={setOrders} restaurants={restaurants} onOrderStatusPersist={onOrderStatusPersist} /> : null}
            {activeTab === 'Commandes' ? <OrdersAdmin orders={orders} setOrders={setOrders} onOrderStatusPersist={onOrderStatusPersist} onOrdersRefresh={onOrdersRefresh} /> : null}
            {activeTab === 'Menu' ? (
              <MenuAdmin
                products={products}
                setProducts={setProducts}
                categories={categories}
                restaurants={restaurants}
                onProductPersist={onProductPersist}
                onProductDelete={onProductDelete}
              />
            ) : null}
            {activeTab === 'Catégories' ? (
              <CategoriesAdmin
                categories={categories}
                setCategories={setCategories}
                products={products}
                setProducts={setProducts}
                restaurants={restaurants}
                onCategoryPersist={onCategoryPersist}
                onCategoryDelete={onCategoryDelete}
                onProductPersist={onProductPersist}
              />
            ) : null}
            {activeTab === 'Restaurants' ? <RestaurantsAdmin restaurants={restaurants} setRestaurants={setRestaurants} onRestaurantPersist={onRestaurantPersist} /> : null}
            {activeTab === 'Stats' ? <StatsAdmin orders={orders} /> : null}
            {activeTab === 'Offres' ? <OffersAdmin offers={offers} setOffers={setOffers} onOfferPersist={onOfferPersist} onOfferDelete={onOfferDelete} /> : null}
            {activeTab === 'Coupons' ? <CouponsAdmin coupon={coupon} setCoupon={setCoupon} onCouponPersist={onCouponPersist} /> : null}
            {activeTab === 'Notifications' ? (
              <NotificationsAdmin
                emailCampaigns={pushCampaigns}
                setEmailCampaigns={setPushCampaigns}
                offerPushCampaigns={offerPushCampaigns}
                setOfferPushCampaigns={setOfferPushCampaigns}
                pushDiagnostics={pushDiagnostics}
                onMarketingEmail={onMarketingEmail}
                onMarketingPush={onMarketingPush}
                onPushRefresh={onPushRefresh}
              />
            ) : null}
            {activeTab === 'Avis' ? <ReviewsAdmin reviews={reviews} orders={orders} onReviewsRefresh={onReviewsRefresh} /> : null}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const escapeTicketText = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[character] ?? character;
  });

const getOrderClientNotes = (order: Order) =>
  order.items
    .filter((item) => item.note.trim())
    .map((item) => ({
      productName: item.product.name,
      quantity: item.quantity,
      note: item.note.trim(),
    }));

const playKitchenAlertSound = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }
  const AudioContextConstructor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }
  const audioContext = new AudioContextConstructor();
  const playTone = (startTime: number, frequency: number) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.3);
  };
  const now = audioContext.currentTime;
  playTone(now, 880);
  playTone(now + 0.38, 660);
  window.setTimeout(() => void audioContext.close(), 900);
};

const printKitchenTicket = (order: Order, restaurant: Restaurant) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    Alert.alert('Impression', 'L’impression ticket est disponible depuis la console admin dans un navigateur.');
    return;
  }
  const printWindow = window.open('', '_blank', 'width=420,height=720');
  if (!printWindow) {
    Alert.alert('Impression bloquée', 'Autorise les pop-ups pour ouvrir le ticket cuisine.');
    return;
  }
  const couponDiscount = getOrderCouponDiscount(order);
  const itemRows = order.items.map((item) => `
    <div class="item">
      <strong>${item.quantity}x ${escapeTicketText(item.product.name)}</strong>
      ${item.extras.length ? `<div>Suppléments : ${escapeTicketText(item.extras.map((extra) => extra.name).join(', '))}</div>` : ''}
      ${item.note ? `<div class="note"><span>NOTE CLIENT</span>${escapeTicketText(item.note)}</div>` : ''}
    </div>
  `).join('');
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Ticket ${escapeTicketText(order.id)}</title>
        <style>
          body { font-family: Arial, sans-serif; width: 280px; margin: 0; padding: 12px; color: #111; }
          h1 { font-size: 20px; margin: 0 0 8px; }
          h2 { font-size: 16px; margin: 14px 0 8px; border-top: 1px dashed #111; padding-top: 10px; }
          .meta { font-size: 13px; line-height: 1.45; }
          .status { display: inline-block; margin: 8px 0; padding: 4px 8px; border: 1px solid #111; font-weight: 700; }
          .item { border-top: 1px dashed #111; padding: 10px 0; font-size: 15px; line-height: 1.35; }
          .note { border: 2px solid #ad1b1f; background: #fff1f2; padding: 8px; margin-top: 8px; font-size: 16px; font-weight: 800; }
          .note span { display: block; color: #ad1b1f; font-size: 12px; margin-bottom: 4px; letter-spacing: .04em; }
          .discount { font-size: 14px; font-weight: 700; margin-top: 10px; }
          .total { border-top: 2px solid #111; margin-top: 10px; padding-top: 10px; font-size: 18px; font-weight: 700; }
          @media print { body { width: auto; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Allo Couscous</h1>
        <div class="meta">
          <strong>${escapeTicketText(order.id)}</strong><br />
          ${escapeTicketText(restaurant.name)}<br />
          Retrait : ${escapeTicketText(order.pickupAt)}<br />
          Client : ${escapeTicketText(order.customerName || 'Client')}<br />
          Tel : ${escapeTicketText(order.customerPhone || '-')}
        </div>
        <div class="status">${escapeTicketText(order.status)}</div>
        <h2>Articles</h2>
        ${itemRows}
        ${couponDiscount > 0 ? `<div class="discount">Code promo ${escapeTicketText(order.couponCode ?? '')} : -${formatPrice(couponDiscount)}</div>` : ''}
        ${order.loyaltyDiscount && order.loyaltyDiscount > 0 ? `<div class="discount">Récompense fidélité : -${formatPrice(order.loyaltyDiscount)}</div>` : ''}
        <div class="total">Total : ${formatPrice(order.total)}</div>
        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

function KitchenAdmin({
  orders,
  setOrders,
  restaurants,
  onOrderStatusPersist,
}: {
  orders: Order[];
  setOrders: (orders: Order[]) => void;
  restaurants: Restaurant[];
  onOrderStatusPersist: (orderId: string, status: OrderStatus, updates?: Partial<Order>) => Promise<void>;
}) {
  const [statusFilter, setStatusFilter] = useState('Actives');
  const [restaurantFilter, setRestaurantFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<KitchenDateFilter>('today');
  const [fullscreen, setFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [refusalOrder, setRefusalOrder] = useState<Order | null>(null);
  const [refusalReason, setRefusalReason] = useState('');
  const knownNewOrderIdsRef = useRef<string[]>(orders.filter((order) => order.status === 'Nouvelle').map((order) => order.id));

  useEffect(() => {
    const currentNewOrderIds = orders.filter((order) => order.status === 'Nouvelle').map((order) => order.id);
    if (soundEnabled) {
      const knownIds = new Set(knownNewOrderIdsRef.current);
      const hasNewOrder = currentNewOrderIds.some((orderId) => !knownIds.has(orderId));
      if (hasNewOrder) {
        playKitchenAlertSound();
      }
    }
    knownNewOrderIdsRef.current = currentNewOrderIds;
  }, [orders, soundEnabled]);

  const dateFilters: { id: KitchenDateFilter; name: string }[] = [
    { id: 'today', name: 'Aujourd’hui' },
    { id: 'tomorrow', name: 'Demain' },
    { id: 'future', name: 'Planifiées' },
    { id: 'all', name: 'Toutes' },
  ];
  const visibleByRestaurantOrders = orders.filter((order) => restaurantFilter === 'all' || order.restaurantId === restaurantFilter);
  const getKitchenDateCount = (filter: KitchenDateFilter) =>
    visibleByRestaurantOrders.filter((order) => matchesKitchenDateFilter(order, filter) && !['Terminée', 'Annulée'].includes(order.status)).length;
  const tomorrowOrdersCount = getKitchenDateCount('tomorrow');
  const futureOrdersCount = getKitchenDateCount('future');
  const hiddenPlannedOrdersCount = tomorrowOrdersCount + futureOrdersCount;

  const activeOrders = orders.filter((order) => {
    const matchesRestaurant = restaurantFilter === 'all' || order.restaurantId === restaurantFilter;
    if (!matchesRestaurant) return false;
    if (!matchesKitchenDateFilter(order, dateFilter)) return false;
    if (statusFilter === 'Actives') return !['Terminée', 'Annulée'].includes(order.status);
    if (statusFilter === 'Nouvelles') return order.status === 'Nouvelle';
    if (statusFilter === 'En cours') return order.status === 'Acceptée' || order.status === 'En préparation';
    if (statusFilter === 'Prêtes') return order.status === 'Prête';
    if (statusFilter === 'Terminées') return order.status === 'Terminée';
    return true;
  }).sort(compareOrdersByPickup);
  const nextStatus = (status: OrderStatus): OrderStatus => {
    if (status === 'Nouvelle') return 'Acceptée';
    if (status === 'Acceptée') return 'En préparation';
    if (status === 'En préparation') return 'Prête';
    if (status === 'Prête') return 'Terminée';
    return status;
  };
  const updateStatus = async (order: Order, status: OrderStatus, updates: Partial<Order> = {}) => {
    const updatedOrder = { ...order, ...updates, status };
    setOrders(orders.map((item) => (item.id === order.id ? updatedOrder : item)));
    try {
      await onOrderStatusPersist(order.id, status, updates);
    } catch (error) {
      showSupabaseAdminError(error);
    }
  };
  const updatePrepTime = (order: Order, delta: number) => {
    const currentPrep = order.estimatedPrepMinutes || Math.max(...order.items.map((item) => item.product.prepMinutes), 10);
    void updateStatus(order, order.status, { estimatedPrepMinutes: Math.max(5, currentPrep + delta) });
  };
  const openRefusal = (order: Order) => {
    setRefusalOrder(order);
    setRefusalReason(order.refusalReason || 'Créneau indisponible');
  };
  const confirmRefusal = async () => {
    if (!refusalOrder) return;
    await updateStatus(refusalOrder, 'Annulée', { refusalReason: refusalReason.trim() || 'Commande refusée par le restaurant' });
    setRefusalOrder(null);
    setRefusalReason('');
  };
  const enableSound = () => {
    knownNewOrderIdsRef.current = orders.filter((order) => order.status === 'Nouvelle').map((order) => order.id);
    setSoundEnabled(true);
    playKitchenAlertSound();
  };
  const getOrderRestaurant = (order: Order) => restaurants.find((restaurant) => restaurant.id === order.restaurantId) ?? getRestaurant(order.restaurantId);

  return (
    <View>
      <AdminTitle title="Cuisine" action="Mode plein écran" onAction={() => setFullscreen(true)} />
      <View style={styles.adminInlineActions}>
        <Pressable style={[styles.adminTinyButton, soundEnabled && styles.filterPillActive]} onPress={enableSound}>
          <Text style={[styles.adminTinyButtonText, soundEnabled && styles.filterTextActive]}>{soundEnabled ? 'Son actif' : 'Activer le son'}</Text>
        </Pressable>
        <Text style={styles.tableSub}>Alerte sonore à chaque nouvelle commande.</Text>
      </View>
      <View style={styles.adminFilters}>
        {[{ id: 'all', name: 'Tous les restaurants' }, ...restaurants].map((restaurant) => (
          <Pressable
            key={restaurant.id}
            style={[styles.filterPill, restaurantFilter === restaurant.id && styles.filterPillActive]}
            onPress={() => setRestaurantFilter(restaurant.id)}
          >
            <Text style={[styles.filterText, restaurantFilter === restaurant.id && styles.filterTextActive]}>{restaurant.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.adminFilters}>
        {dateFilters.map((filter) => (
          <Pressable key={filter.id} style={[styles.filterPill, dateFilter === filter.id && styles.filterPillActive]} onPress={() => setDateFilter(filter.id)}>
            <Text style={[styles.filterText, dateFilter === filter.id && styles.filterTextActive]}>
              {filter.name} ({getKitchenDateCount(filter.id)})
            </Text>
          </Pressable>
        ))}
      </View>
      {dateFilter === 'today' && hiddenPlannedOrdersCount > 0 ? (
        <View style={styles.plannedOrdersNotice}>
          <View style={styles.plannedOrdersNoticeCopy}>
            <Text style={styles.plannedOrdersNoticeTitle}>Commandes à venir masquées</Text>
            <Text style={styles.plannedOrdersNoticeText}>
              {hiddenPlannedOrdersCount} commande{hiddenPlannedOrdersCount > 1 ? 's' : ''} prévue{hiddenPlannedOrdersCount > 1 ? 's' : ''} après aujourd’hui.
            </Text>
          </View>
          <Pressable style={styles.plannedOrdersNoticeButton} onPress={() => setDateFilter(tomorrowOrdersCount > 0 ? 'tomorrow' : 'future')}>
            <Text style={styles.plannedOrdersNoticeButtonText}>Voir</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.adminFilters}>
        {['Actives', 'Nouvelles', 'En cours', 'Prêtes', 'Terminées'].map((filter) => (
          <Pressable key={filter} style={[styles.filterPill, statusFilter === filter && styles.filterPillActive]} onPress={() => setStatusFilter(filter)}>
            <Text style={[styles.filterText, statusFilter === filter && styles.filterTextActive]}>{filter}</Text>
          </Pressable>
        ))}
      </View>
      {!activeOrders.length ? <Text style={styles.adminEmpty}>Aucune commande</Text> : null}
      <View style={styles.adminGrid}>
        {activeOrders.map((order) => {
          const urgency = getKitchenOrderUrgency(order);
          const couponDiscount = getOrderCouponDiscount(order);
          return (
            <Pressable
              key={order.id}
              style={[
                styles.kitchenCard,
                urgency?.level === 'soon' && styles.kitchenCardSoon,
                urgency?.level === 'late' && styles.kitchenCardLate,
              ]}
              onPress={() => setSelectedOrder(order)}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.orderId}>{order.id}</Text>
                <Text style={styles.orderBadgeText}>{order.status}</Text>
              </View>
              <View style={[styles.kitchenDateBadge, !matchesKitchenDateFilter(order, 'today') && styles.kitchenDateBadgeFuture]}>
                <Text style={styles.kitchenDateText}>Retrait {getKitchenPickupDateLabel(order)}</Text>
              </View>
              {urgency ? (
                <View style={[styles.kitchenUrgencyBadge, urgency.level === 'late' && styles.kitchenUrgencyBadgeLate]}>
                  <Text style={styles.kitchenUrgencyText}>{urgency.label}</Text>
                </View>
              ) : null}
              {order.isPreorder ? <Text style={styles.preorderBadge}>Précommande à valider</Text> : null}
              <Text style={styles.orderMeta}>{getRestaurant(order.restaurantId).name} · {order.pickupAt}</Text>
              {couponDiscount > 0 ? <Text style={styles.tableSub}>Code promo {order.couponCode} : -{formatPrice(couponDiscount)}</Text> : null}
              {order.loyaltyDiscount && order.loyaltyDiscount > 0 ? <Text style={styles.tableSub}>Récompense fidélité : -{formatPrice(order.loyaltyDiscount)}</Text> : null}
              <Text style={styles.orderTotal}>{formatPrice(order.total)} · Paiement au retrait</Text>
              <View style={styles.prepControlRow}>
                <Text style={styles.tableSub}>Temps estimé : {order.estimatedPrepMinutes || Math.max(...order.items.map((item) => item.product.prepMinutes), 10)} min</Text>
                <View style={styles.adminInlineActions}>
                  <Pressable style={styles.adminTinyButton} onPress={() => updatePrepTime(order, -5)}>
                    <Text style={styles.adminTinyButtonText}>-5</Text>
                  </Pressable>
                  <Pressable style={styles.adminTinyButton} onPress={() => updatePrepTime(order, 5)}>
                    <Text style={styles.adminTinyButtonText}>+5</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.orderItems}>{order.items.map((item) => `${item.quantity}x ${item.product.name}`).join('\n')}</Text>
              {getOrderClientNotes(order).length ? (
                <View style={styles.kitchenNoteBox}>
                  <Text style={styles.kitchenNoteTitle}>NOTE CLIENT</Text>
                  {getOrderClientNotes(order).map((clientNote) => (
                    <Text key={`${clientNote.productName}-${clientNote.note}`} style={styles.kitchenNoteText}>
                      {clientNote.quantity}x {clientNote.productName} : {clientNote.note}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Pressable style={styles.secondaryButton} onPress={(event) => { event.stopPropagation(); printKitchenTicket(order, getOrderRestaurant(order)); }}>
                <Text style={styles.secondaryButtonText}>Imprimer ticket</Text>
              </Pressable>
              {order.status === 'Nouvelle' ? (
                <View style={styles.adminInlineActions}>
                  <Pressable style={styles.actionButton} onPress={() => void updateStatus(order, 'Acceptée')}>
                    <Text style={styles.actionButtonText}>Accepter</Text>
                  </Pressable>
                  <Pressable style={[styles.adminTinyButton, styles.adminDangerButton]} onPress={() => openRefusal(order)}>
                    <Text style={styles.adminTinyButtonText}>Refuser</Text>
                  </Pressable>
                </View>
              ) : !['Terminée', 'Annulée'].includes(order.status) ? (
                <Pressable style={styles.actionButton} onPress={() => void updateStatus(order, nextStatus(order.status))}>
                  <Text style={styles.actionButtonText}>Passer à : {nextStatus(order.status)}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Modal transparent={false} visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.kitchenFullscreen}>
          <View style={styles.kitchenFullscreenHeader}>
            <Text style={styles.kitchenFullscreenTitle}>Cuisine - commandes actives</Text>
            <Pressable style={styles.adminActionButton} onPress={() => setFullscreen(false)}>
              <Text style={styles.adminActionText}>Fermer</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.kitchenFullscreenGrid}>
            {activeOrders.length ? activeOrders.map((order) => {
              const urgency = getKitchenOrderUrgency(order);
              const couponDiscount = getOrderCouponDiscount(order);
              return (
                <Pressable
                  key={order.id}
                  style={[
                    styles.kitchenFullscreenCard,
                    urgency?.level === 'soon' && styles.kitchenCardSoon,
                    urgency?.level === 'late' && styles.kitchenCardLate,
                  ]}
                  onPress={() => setSelectedOrder(order)}
                >
                  <Text style={styles.orderId}>{order.id}</Text>
                  <Text style={styles.kitchenFullscreenStatus}>{order.status}</Text>
                  <View style={[styles.kitchenDateBadge, !matchesKitchenDateFilter(order, 'today') && styles.kitchenDateBadgeFuture]}>
                    <Text style={styles.kitchenDateText}>Retrait {getKitchenPickupDateLabel(order)}</Text>
                  </View>
                  {urgency ? (
                    <View style={[styles.kitchenUrgencyBadge, urgency.level === 'late' && styles.kitchenUrgencyBadgeLate]}>
                      <Text style={styles.kitchenUrgencyText}>{urgency.label}</Text>
                    </View>
                  ) : null}
                  {order.isPreorder ? <Text style={styles.preorderBadge}>Précommande à valider</Text> : null}
                  <Text style={styles.orderMeta}>{getRestaurant(order.restaurantId).name} · {order.pickupAt}</Text>
                  {couponDiscount > 0 ? <Text style={styles.tableSub}>Code promo {order.couponCode} : -{formatPrice(couponDiscount)}</Text> : null}
                  {order.loyaltyDiscount && order.loyaltyDiscount > 0 ? <Text style={styles.tableSub}>Récompense fidélité : -{formatPrice(order.loyaltyDiscount)}</Text> : null}
                  <Text style={styles.orderTotal}>{formatPrice(order.total)} · Paiement au retrait</Text>
                  <Text style={styles.tableSub}>Temps estimé : {order.estimatedPrepMinutes || Math.max(...order.items.map((item) => item.product.prepMinutes), 10)} min</Text>
                  <Text style={styles.orderItems}>{order.items.map((item) => `${item.quantity}x ${item.product.name}`).join('\n')}</Text>
                  {getOrderClientNotes(order).length ? (
                    <View style={styles.kitchenNoteBox}>
                      <Text style={styles.kitchenNoteTitle}>NOTE CLIENT</Text>
                      {getOrderClientNotes(order).map((clientNote) => (
                        <Text key={`${clientNote.productName}-${clientNote.note}`} style={styles.kitchenNoteText}>
                          {clientNote.quantity}x {clientNote.productName} : {clientNote.note}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <Pressable style={styles.secondaryButton} onPress={(event) => { event.stopPropagation(); printKitchenTicket(order, getOrderRestaurant(order)); }}>
                    <Text style={styles.secondaryButtonText}>Imprimer ticket</Text>
                  </Pressable>
                  {order.status === 'Nouvelle' ? (
                    <View style={styles.adminInlineActions}>
                      <Pressable style={styles.actionButton} onPress={() => void updateStatus(order, 'Acceptée')}>
                        <Text style={styles.actionButtonText}>Accepter</Text>
                      </Pressable>
                      <Pressable style={[styles.adminTinyButton, styles.adminDangerButton]} onPress={() => openRefusal(order)}>
                        <Text style={styles.adminTinyButtonText}>Refuser</Text>
                      </Pressable>
                    </View>
                  ) : !['Terminée', 'Annulée'].includes(order.status) ? (
                    <Pressable style={styles.actionButton} onPress={() => void updateStatus(order, nextStatus(order.status))}>
                      <Text style={styles.actionButtonText}>Passer à : {nextStatus(order.status)}</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            }) : <Text style={styles.adminEmpty}>Aucune commande</Text>}
          </ScrollView>
        </View>
      </Modal>
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onUpdateStatus={(order, status) => void updateStatus(order, status)} />
      <Modal transparent animationType="fade" visible={Boolean(refusalOrder)} onRequestClose={() => setRefusalOrder(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.adminOrderDetail}>
            <Text style={styles.adminFormTitle}>Refuser la commande</Text>
            <Text style={styles.helperText}>Le motif sera visible dans le suivi client.</Text>
            <TextInput
              value={refusalReason}
              onChangeText={setRefusalReason}
              style={[styles.input, styles.adminTextArea]}
              multiline
              placeholder="Ex : créneau complet, produit indisponible..."
            />
            <View style={styles.adminInlineActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setRefusalOrder(null)}>
                <Text style={styles.secondaryButtonText}>Annuler</Text>
              </Pressable>
              <Pressable style={[styles.adminTinyButton, styles.adminDangerButton]} onPress={() => void confirmRefusal()}>
                <Text style={styles.adminTinyButtonText}>Confirmer le refus</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function OrdersAdmin({
  orders,
  setOrders,
  onOrderStatusPersist,
  onOrdersRefresh,
}: {
  orders: Order[];
  setOrders: (orders: Order[]) => void;
  onOrderStatusPersist: (orderId: string, status: OrderStatus, updates?: Partial<Order>) => Promise<void>;
  onOrdersRefresh: () => Promise<void>;
}) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dateFilter, setDateFilter] = useState<KitchenDateFilter>('today');
  const dateFilters: { id: KitchenDateFilter; name: string }[] = [
    { id: 'today', name: 'Aujourd’hui' },
    { id: 'tomorrow', name: 'Demain' },
    { id: 'future', name: 'Planifiées' },
    { id: 'all', name: 'Toutes' },
  ];
  const getDateCount = (filter: KitchenDateFilter) => orders.filter((order) => matchesKitchenDateFilter(order, filter)).length;
  const tomorrowOrdersCount = getDateCount('tomorrow');
  const futureOrdersCount = getDateCount('future');
  const hiddenPlannedOrdersCount = tomorrowOrdersCount + futureOrdersCount;
  const filteredOrders = orders.filter((order) => matchesKitchenDateFilter(order, dateFilter)).sort(compareOrdersByPickup);
  const updateStatus = async (order: Order, status: OrderStatus, updates: Partial<Order> = {}) => {
    const updatedOrder = { ...order, ...updates, status };
    setOrders(orders.map((item) => (item.id === order.id ? updatedOrder : item)));
    try {
      await onOrderStatusPersist(order.id, status, updates);
    } catch (error) {
      showSupabaseAdminError(error);
    }
  };
  const advanceOrder = (order: Order) => {
    if (['Terminée', 'Annulée'].includes(order.status)) return;
    const nextStatus: Record<OrderStatus, OrderStatus> = {
      Nouvelle: 'Acceptée',
      Acceptée: 'En préparation',
      'En préparation': 'Prête',
      Prête: 'Terminée',
      Terminée: 'Terminée',
      Annulée: 'Annulée',
    };
    void updateStatus(order, nextStatus[order.status]);
  };
  const getAdvanceActionLabel = (status: OrderStatus) => {
    if (status === 'Nouvelle') return 'Accepter';
    if (status === 'Acceptée') return 'Préparer';
    if (status === 'En préparation') return 'Prête';
    if (status === 'Prête') return 'Terminer';
    return 'Finalisée';
  };

  return (
    <View>
      <AdminTitle title="Gestion des commandes" action="Actualiser" onAction={() => void onOrdersRefresh()} />
      <View style={styles.adminFilters}>
        {dateFilters.map((filter) => (
          <Pressable key={filter.id} style={[styles.filterPill, dateFilter === filter.id && styles.filterPillActive]} onPress={() => setDateFilter(filter.id)}>
            <Text style={[styles.filterText, dateFilter === filter.id && styles.filterTextActive]}>
              {filter.name} ({getDateCount(filter.id)})
            </Text>
          </Pressable>
        ))}
      </View>
      {dateFilter === 'today' && hiddenPlannedOrdersCount > 0 ? (
        <View style={styles.plannedOrdersNotice}>
          <View style={styles.plannedOrdersNoticeCopy}>
            <Text style={styles.plannedOrdersNoticeTitle}>Commandes à venir disponibles</Text>
            <Text style={styles.plannedOrdersNoticeText}>
              {hiddenPlannedOrdersCount} commande{hiddenPlannedOrdersCount > 1 ? 's' : ''} prévue{hiddenPlannedOrdersCount > 1 ? 's' : ''} après aujourd’hui.
            </Text>
          </View>
          <Pressable style={styles.plannedOrdersNoticeButton} onPress={() => setDateFilter(tomorrowOrdersCount > 0 ? 'tomorrow' : 'future')}>
            <Text style={styles.plannedOrdersNoticeButtonText}>Voir</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminTableScrollContent}>
        <View style={[styles.tableCard, styles.tableCardWide]}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.tableProduct]}>Commande</Text>
            <Text style={[styles.tableHeaderText, styles.tableCell]}>Restaurant</Text>
            <Text style={[styles.tableHeaderText, styles.tableCell]}>Statut</Text>
            <Text style={[styles.tableHeaderText, styles.tablePrice]}>Total</Text>
            <Text style={styles.tableHeaderActions}>Actions</Text>
          </View>
          {!filteredOrders.length ? <Text style={styles.adminEmptySmall}>Aucune commande sur cette période</Text> : null}
          {filteredOrders.map((order) => {
            const isFinalOrder = ['Terminée', 'Annulée'].includes(order.status);
            return (
              <Pressable key={order.id} style={styles.tableRow} onPress={() => setSelectedOrder(order)}>
                <View style={styles.tableProduct}>
                  <Text style={styles.tablePrimary}>{order.id}</Text>
                  <Text style={styles.tableSub}>Retrait {getKitchenPickupDateLabel(order)}</Text>
                </View>
                <Text style={styles.tableCell}>{getRestaurant(order.restaurantId).name}</Text>
                <View style={styles.tableCellBlock}>
                  <View
                    style={[
                      styles.adminStatusBadge,
                      order.status === 'Nouvelle' && styles.adminStatusBadgeNew,
                      order.status === 'Prête' && styles.adminStatusBadgeReady,
                      order.status === 'Terminée' && styles.adminStatusBadgeDone,
                      order.status === 'Annulée' && styles.adminStatusBadgeCancelled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.adminStatusBadgeText,
                        order.status === 'Annulée' && styles.adminStatusBadgeTextDanger,
                        order.status === 'Terminée' && styles.adminStatusBadgeTextMuted,
                      ]}
                    >
                      {order.status}
                    </Text>
                  </View>
                  {order.isPreorder ? <Text style={styles.tableSub}>Précommande</Text> : null}
                </View>
                <Text style={styles.tablePrice}>{formatPrice(order.total)}</Text>
                <View style={styles.adminInlineActions}>
                  {isFinalOrder ? (
                    <Text style={styles.adminMutedActionText}>Finalisée</Text>
                  ) : (
                    <>
                      <Pressable
                        style={styles.adminTinyButton}
                        onPress={(event) => {
                          event.stopPropagation();
                          advanceOrder(order);
                        }}
                      >
                        <Text style={styles.adminTinyButtonText}>{getAdvanceActionLabel(order.status)}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.adminTinyButton, styles.adminDangerButton]}
                        onPress={(event) => {
                          event.stopPropagation();
                          void updateStatus(order, 'Annulée');
                        }}
                      >
                        <Text style={styles.adminTinyButtonText}>Annuler</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onUpdateStatus={(order, status) => void updateStatus(order, status)} />
    </View>
  );
}

function OrderDetailModal({
  order,
  onClose,
  onUpdateStatus,
}: {
  order: Order | null;
  onClose: () => void;
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
}) {
  if (!order) return null;
  const statuses: OrderStatus[] = ['Nouvelle', 'Acceptée', 'En préparation', 'Prête', 'Terminée', 'Annulée'];
  const couponDiscount = getOrderCouponDiscount(order);

  return (
    <Modal transparent animationType="fade" visible={Boolean(order)} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.adminOrderDetail}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.adminFormTitle}>{order.id}</Text>
              <Text style={styles.orderMeta}>{getRestaurant(order.restaurantId).name} · Retrait {order.pickupAt}</Text>
              {order.isPreorder ? <Text style={styles.preorderBadge}>Précommande à valider par le restaurant</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.adminStatusGrid}>
            {statuses.map((status) => (
              <Pressable
                key={status}
                style={[styles.filterPill, order.status === status && styles.filterPillActive]}
                onPress={() => onUpdateStatus(order, status)}
              >
                <Text style={[styles.filterText, order.status === status && styles.filterTextActive]}>{status}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.cardDivider} />
          <Text style={styles.optionTitle}>Client</Text>
          <View style={styles.adminOrderCustomer}>
            <Text style={styles.tablePrimary}>{order.customerName || 'Client invité'}</Text>
            {order.customerPhone ? <Text style={styles.tableSub}>Téléphone : {order.customerPhone}</Text> : null}
            {order.customerEmail ? <Text style={styles.tableSub}>Email : {order.customerEmail}</Text> : null}
            {order.customerPostalAddress ? <Text style={styles.tableSub}>Adresse : {order.customerPostalAddress}</Text> : null}
            <Text style={styles.tableSub}>{order.notifyWhenReady === false ? 'Notification prêt désactivée' : 'Prévenir quand la commande est prête'}</Text>
          </View>
          {order.estimatedPrepMinutes ? (
            <>
              <View style={styles.cardDivider} />
              <Text style={styles.optionTitle}>Temps estimé</Text>
              <Text style={styles.tableSub}>{order.estimatedPrepMinutes} min</Text>
            </>
          ) : null}
          {order.refusalReason ? (
            <>
              <View style={styles.cardDivider} />
              <Text style={styles.optionTitle}>Motif de refus / annulation</Text>
              <Text style={styles.tableSub}>{order.refusalReason}</Text>
            </>
          ) : null}
          <View style={styles.cardDivider} />
          <Text style={styles.optionTitle}>Articles</Text>
          {getOrderClientNotes(order).length ? (
            <View style={styles.kitchenNoteBox}>
              <Text style={styles.kitchenNoteTitle}>NOTE CLIENT</Text>
              {getOrderClientNotes(order).map((clientNote) => (
                <Text key={`${clientNote.productName}-${clientNote.note}`} style={styles.kitchenNoteText}>
                  {clientNote.quantity}x {clientNote.productName} : {clientNote.note}
                </Text>
              ))}
            </View>
          ) : null}
          {order.items.map((item, index) => (
            <View key={`${item.product.id}-${index}`} style={styles.adminOrderItem}>
              <View style={styles.flex}>
                <Text style={styles.tablePrimary}>{item.quantity}x {item.product.name}</Text>
                {item.extras.length ? <Text style={styles.tableSub}>Suppléments : {item.extras.map((extra) => extra.name).join(', ')}</Text> : null}
                {item.note ? <Text style={styles.kitchenNoteText}>Note client : {item.note}</Text> : null}
              </View>
              <Text style={styles.tablePrice}>{formatPrice(getItemTotal(item))}</Text>
            </View>
          ))}
          <View style={styles.cardDivider} />
          {couponDiscount > 0 ? <PriceLine label={`Code promo ${order.couponCode}`} value={`-${formatPrice(couponDiscount)}`} /> : null}
          {order.loyaltyDiscount && order.loyaltyDiscount > 0 ? <PriceLine label="Récompense fidélité" value={`-${formatPrice(order.loyaltyDiscount)}`} /> : null}
          <PriceLine label="Total" value={formatPrice(order.total)} strong />
          <Text style={styles.helperText}>Paiement au retrait. Le client doit être prévenu quand la commande passe en Prête.</Text>
        </View>
      </View>
    </Modal>
  );
}

function MenuAdmin({
  products,
  setProducts,
  categories,
  restaurants,
  onProductPersist,
  onProductDelete,
}: {
  products: Product[];
  setProducts: (products: Product[]) => void;
  categories: Category[];
  restaurants: Restaurant[];
  onProductPersist: (product: Product) => Promise<void>;
  onProductDelete: (productId: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]?.label ?? 'Entrées');
  const [filter, setFilter] = useState('Tout');
  const [price, setPrice] = useState('10');
  const [prepMinutes, setPrepMinutes] = useState('10');
  const [image, setImage] = useState(tajineImage);
  const [imageUploadStatus, setImageUploadStatus] = useState('');
  const [labels, setLabels] = useState('');
  const [allergens, setAllergens] = useState('');
  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraName, setExtraName] = useState('');
  const [extraPrice, setExtraPrice] = useState('');
  const [selectedSupplementIds, setSelectedSupplementIds] = useState<string[]>([]);
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>(restaurants.map((restaurant) => restaurant.id));
  const supplementProducts = products.filter((product) => normalizeTextKey(product.category).startsWith('supplement'));
  const selectableSupplementProducts = supplementProducts.filter((product) => product.id !== editingId);
  const supplementProductIds = new Set(supplementProducts.map((product) => product.id));

  const toggleRestaurantAssignment = (restaurantId: string) => {
    setSelectedRestaurantIds((current) =>
      current.includes(restaurantId) ? current.filter((id) => id !== restaurantId) : [...current, restaurantId],
    );
  };
  const toggleSupplementAssignment = (productId: string) => {
    setSelectedSupplementIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    );
  };

  const toggleAvailability = async (productId: string) => {
    const nextProducts = products.map((product) => (product.id === productId ? { ...product, available: !product.available } : product));
    const nextProduct = nextProducts.find((product) => product.id === productId);
    setProducts(nextProducts);
    if (!nextProduct) return;
    try {
      await onProductPersist(nextProduct);
    } catch (error) {
      showSupabaseAdminError(error);
    }
  };
  const startNewProduct = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setCategory(categories[0]?.label ?? 'Entrées');
    setPrice('10');
    setPrepMinutes('10');
    setImage(tajineImage);
    setImageUploadStatus('');
    setLabels('');
    setAllergens('');
    setExtras([]);
    setExtraName('');
    setExtraPrice('');
    setSelectedSupplementIds([]);
    setSelectedRestaurantIds(restaurants.map((restaurant) => restaurant.id));
    setIsEditing(true);
  };
  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setCategory(categories[0]?.label ?? 'Entrées');
    setPrice('10');
    setPrepMinutes('10');
    setImage(tajineImage);
    setImageUploadStatus('');
    setLabels('');
    setAllergens('');
    setExtras([]);
    setExtraName('');
    setExtraPrice('');
    setSelectedSupplementIds([]);
    setSelectedRestaurantIds(restaurants.map((restaurant) => restaurant.id));
    setIsEditing(false);
  };
  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setDescription(product.description);
    setCategory(product.category);
    setPrice(String(product.price));
    setPrepMinutes(String(product.prepMinutes));
    setImage(product.image || tajineImage);
    setImageUploadStatus('');
    setLabels((product.labels ?? []).join(', '));
    setAllergens((product.allergens ?? []).join(', '));
    setExtras((product.extras ?? []).filter((extra) => !supplementProductIds.has(extra.id)));
    setSelectedSupplementIds((product.extras ?? []).filter((extra) => supplementProductIds.has(extra.id)).map((extra) => extra.id));
    setExtraName('');
    setExtraPrice('');
    setSelectedRestaurantIds(product.restaurantIds?.length ? product.restaurantIds : restaurants.map((restaurant) => restaurant.id));
    setIsEditing(true);
  };
  const addExtra = () => {
    const parsedPrice = Number(extraPrice.replace(',', '.'));
    if (!extraName.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert('Supplément incomplet', 'Renseigne un nom et un prix valide.');
      return;
    }
    const nextExtra: Extra = {
      id: `${extraName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: extraName.trim(),
      price: parsedPrice,
    };
    setExtras((current) => [...current, nextExtra]);
    setExtraName('');
    setExtraPrice('');
  };
  const removeExtra = (extraId: string) => {
    setExtras((current) => current.filter((extra) => extra.id !== extraId));
  };
  const saveProduct = async () => {
    const parsedPrice = Number(price.replace(',', '.'));
    const parsedPrep = Number(prepMinutes);
    if (!name.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0 || !image.trim()) {
      Alert.alert('Produit incomplet', 'Renseigne au minimum un nom, un prix valide et une image.');
      return;
    }
    if (!selectedRestaurantIds.length) {
      Alert.alert('Restaurant manquant', 'Sélectionne au moins un restaurant pour ce plat.');
      return;
    }
    const currentProduct = products.find((product) => product.id === editingId);
    const assignedSupplementExtras = supplementProducts
      .filter((product) => product.id !== editingId && selectedSupplementIds.includes(product.id))
      .map((product) => ({ id: product.id, name: product.name, price: product.price }));
    const mergedExtras = [
      ...assignedSupplementExtras,
      ...extras.filter((extra) => !assignedSupplementExtras.some((assignedExtra) => assignedExtra.id === extra.id)),
    ];
    const nextProduct: Product = {
      id: editingId ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || 'Description à compléter',
      category,
      price: parsedPrice,
      prepMinutes: Number.isNaN(parsedPrep) ? 10 : parsedPrep,
      available: currentProduct?.available ?? true,
      image: image.trim(),
      extras: mergedExtras,
      restaurantIds: selectedRestaurantIds,
      labels: labels.split(',').map((label) => label.trim()).filter(Boolean),
      allergens: allergens.split(',').map((allergen) => allergen.trim()).filter(Boolean),
    };
    setProducts(editingId ? products.map((product) => (product.id === editingId ? { ...product, ...nextProduct } : product)) : [nextProduct, ...products]);
    try {
      await onProductPersist(nextProduct);
    } catch (error) {
      showSupabaseAdminError(error);
    }
    setFilter(category);
    resetForm();
  };
  const removeProduct = async (productId: string) => {
    setProducts(products.filter((item) => item.id !== productId));
    try {
      await onProductDelete(productId);
    } catch (error) {
      showSupabaseAdminError(error);
    }
  };
  const visibleProducts = filter === 'Tout' ? products : products.filter((product) => product.category === filter);
  const imageComesFromDevice = image.startsWith('data:image/');
  const imageStoredInSupabase = image.includes(`/storage/v1/object/public/${productImagesBucket}/`);
  const handlePickProductImage = () => {
    pickImageFromDevice(async (imageDataUrl) => {
      setImage(imageDataUrl);
      setImageUploadStatus(isSupabaseConfigured ? 'Envoi de la photo vers Supabase...' : 'Photo prête localement.');
      if (!isSupabaseConfigured) {
        return;
      }
      try {
        const publicUrl = await uploadImageToSupabaseStorage(imageDataUrl, 'products');
        setImage(publicUrl);
        setImageUploadStatus('Photo envoyée dans Supabase Storage.');
      } catch (error) {
        setImageUploadStatus('Photo conservée localement. Vérifie le bucket Supabase Storage.');
        showSupabaseAdminError(error);
      }
    });
  };

  return (
    <View>
      <AdminTitle title="Gestion du menu" action="+ Ajouter un produit" onAction={startNewProduct} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminCategoryFilters}>
        {['Tout', ...categories.map((category) => category.label)].map((category) => (
          <Pressable key={category} style={[styles.categoryFilter, filter === category && styles.categoryFilterActive]} onPress={() => setFilter(category)}>
            <Text style={[styles.categoryFilterText, filter === category && styles.categoryFilterTextActive]}>{category}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.adminQuickPanel}>
        <View>
          <Text style={styles.adminFormTitle}>Ruptures rapides</Text>
          <Text style={styles.tableSub}>Clique sur un plat pour le rendre disponible ou indisponible immédiatement.</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickStockRow}>
          {products.slice(0, 12).map((product) => (
            <Pressable
              key={product.id}
              style={[styles.quickStockPill, !product.available && styles.quickStockPillOff]}
              onPress={() => void toggleAvailability(product.id)}
            >
              <Text style={[styles.quickStockText, !product.available && styles.quickStockTextOff]}>{product.name}</Text>
              <Text style={styles.quickStockMeta}>{product.available ? 'Disponible' : 'Rupture'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {isEditing ? (
        <View style={styles.adminFormCard}>
          <Text style={styles.adminFormTitle}>{editingId ? 'Modifier le produit' : 'Nouveau produit'}</Text>
          <AdminField label="Nom" value={name} onChangeText={setName} />
          <AdminField label="Description" value={description} onChangeText={setDescription} multiline />
          <Text style={styles.inputLabel}>Image du plat</Text>
          <View style={styles.adminImageActions}>
            <Pressable style={styles.actionButton} onPress={handlePickProductImage}>
              <Text style={styles.actionButtonText}>Choisir une photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => { setImage(tajineImage); setImageUploadStatus(''); }}>
              <Text style={styles.secondaryButtonText}>Image par défaut</Text>
            </Pressable>
          </View>
          {imageUploadStatus ? <Text style={styles.adminSuccessMessage}>{imageUploadStatus}</Text> : null}
          {imageStoredInSupabase ? (
            <View style={styles.adminSelectedImageNotice}>
              <Text style={styles.tablePrimary}>Photo stockée dans Supabase Storage</Text>
              <Text style={styles.tableSub}>Le plat enregistrera une URL publique légère et rapide.</Text>
            </View>
          ) : imageComesFromDevice ? (
            <View style={styles.adminSelectedImageNotice}>
              <Text style={styles.tablePrimary}>Photo importée depuis votre appareil</Text>
              <Text style={styles.tableSub}>Elle sera enregistrée avec le plat. Pour la production, vérifie que le bucket Storage est actif.</Text>
            </View>
          ) : (
            <AdminField label="Ou coller une URL d’image" value={image} onChangeText={setImage} />
          )}
          <View style={styles.adminImagePreview}>
            <Image source={{ uri: image || tajineImage }} style={styles.adminImagePreviewImage} />
            <View style={styles.flex}>
              <Text style={styles.tablePrimary}>Aperçu du plat</Text>
              <Text style={styles.tableSub}>Choisis une photo depuis l’appareil ou colle une URL.</Text>
            </View>
          </View>
          <Text style={styles.inputLabel}>Catégorie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminCategoryFilters}>
            {categories.map((item) => (
              <Pressable key={item.id} style={[styles.categoryFilter, category === item.label && styles.categoryFilterActive]} onPress={() => setCategory(item.label)}>
                <Text style={[styles.categoryFilterText, category === item.label && styles.categoryFilterTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.adminFormRow}>
            <View style={styles.flex}><AdminField label="Prix" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View>
            <View style={styles.flex}><AdminField label="Préparation min." value={prepMinutes} onChangeText={setPrepMinutes} keyboardType="number-pad" /></View>
          </View>
          <View>
            <Text style={styles.inputLabel}>Restaurants où ce plat est disponible</Text>
            <View style={styles.adminRestaurantAssignGrid}>
              {restaurants.map((restaurant) => {
                const active = selectedRestaurantIds.includes(restaurant.id);
                return (
                  <Pressable
                    key={restaurant.id}
                    style={[styles.restaurantAssignPill, active && styles.restaurantAssignPillActive]}
                    onPress={() => toggleRestaurantAssignment(restaurant.id)}
                  >
                    <Text style={[styles.restaurantAssignText, active && styles.restaurantAssignTextActive]}>{restaurant.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.adminFormRow}>
            <View style={styles.flex}><AdminField label="Labels (séparés par virgule)" value={labels} onChangeText={setLabels} /></View>
            <View style={styles.flex}><AdminField label="Allergènes (séparés par virgule)" value={allergens} onChangeText={setAllergens} /></View>
          </View>
          <View style={styles.adminFormCardNested}>
            <View>
              <Text style={styles.adminFormTitle}>Suppléments proposés avec ce plat</Text>
              <Text style={styles.tableSub}>Coche les produits de la catégorie Suppléments à proposer avec ce plat.</Text>
            </View>
            {selectableSupplementProducts.length ? (
              <View style={styles.adminRestaurantAssignGrid}>
                {selectableSupplementProducts.map((supplement) => {
                  const active = selectedSupplementIds.includes(supplement.id);
                  return (
                    <Pressable
                      key={supplement.id}
                      style={[styles.restaurantAssignPill, active && styles.restaurantAssignPillActive]}
                      onPress={() => toggleSupplementAssignment(supplement.id)}
                    >
                      <Text style={[styles.restaurantAssignText, active && styles.restaurantAssignTextActive]}>
                        {supplement.name} · {formatPrice(supplement.price)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.helperText}>Crée d’abord des produits dans la catégorie Suppléments pour les assigner ici.</Text>
            )}
            <View style={styles.cardDivider} />
            <Text style={styles.tableSub}>Tu peux aussi ajouter un supplément manuel uniquement pour ce plat.</Text>
            <View style={styles.adminFormRow}>
              <View style={styles.flex}><AdminField label="Nom du supplément" value={extraName} onChangeText={setExtraName} /></View>
              <View style={styles.flex}><AdminField label="Prix (€)" value={extraPrice} onChangeText={setExtraPrice} keyboardType="decimal-pad" /></View>
              <Pressable style={styles.adminAddExtraButton} onPress={addExtra}>
                <Text style={styles.adminAddExtraText}>Ajouter</Text>
              </Pressable>
            </View>
            {selectedSupplementIds.length || extras.length ? (
              <View style={styles.adminExtrasList}>
                {selectableSupplementProducts.filter((supplement) => selectedSupplementIds.includes(supplement.id)).map((supplement) => (
                  <View key={supplement.id} style={styles.adminExtraRow}>
                    <View style={styles.flex}>
                      <Text style={styles.tablePrimary}>{supplement.name}</Text>
                      <Text style={styles.tableSub}>Depuis la catégorie Suppléments · + {formatPrice(supplement.price)}</Text>
                    </View>
                    <Pressable onPress={() => toggleSupplementAssignment(supplement.id)}>
                      <Text style={styles.deleteIconText}>🗑</Text>
                    </Pressable>
                  </View>
                ))}
                {extras.map((extra) => (
                  <View key={extra.id} style={styles.adminExtraRow}>
                    <View style={styles.flex}>
                      <Text style={styles.tablePrimary}>{extra.name}</Text>
                      <Text style={styles.tableSub}>+ {formatPrice(extra.price)}</Text>
                    </View>
                    <Pressable onPress={() => removeExtra(extra.id)}>
                      <Text style={styles.deleteIconText}>🗑</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>Aucun supplément associé à ce plat.</Text>
            )}
          </View>
          <View style={styles.adminInlineActions}>
            <Pressable style={styles.actionButton} onPress={() => void saveProduct()}><Text style={styles.actionButtonText}>Enregistrer</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={resetForm}><Text style={styles.secondaryButtonText}>Annuler</Text></Pressable>
          </View>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminTableScrollContent}>
        <View style={[styles.tableCard, styles.tableCardWide]}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.tableProduct]}>Produit</Text>
            <Text style={[styles.tableHeaderText, styles.tableCell]}>Catégorie</Text>
            <Text style={[styles.tableHeaderText, styles.tablePrice]}>Prix</Text>
            <Text style={styles.tableHeaderSwitch}>Disponible</Text>
            <Text style={styles.tableHeaderActions}>Actions</Text>
          </View>
          {visibleProducts.map((product) => (
            <View key={product.id} style={styles.tableRow}>
              <View style={styles.tableProduct}>
                <Text style={styles.tablePrimary}>{product.name}</Text>
                <Text style={styles.tableSub}>{product.description}</Text>
                {product.labels?.length ? <Text style={styles.tableSub}>Labels : {product.labels.join(', ')}</Text> : null}
                {product.allergens?.length ? <Text style={styles.tableSub}>Allergènes : {product.allergens.join(', ')}</Text> : null}
                <Text style={styles.tableSub}>
                  Restaurants : {product.restaurantIds?.length
                    ? restaurants.filter((restaurant) => product.restaurantIds?.includes(restaurant.id)).map((restaurant) => restaurant.name.replace('Allo Couscous ', '')).join(', ')
                    : 'Tous'}
                </Text>
              </View>
              <Text style={styles.tableCell}>{product.category}</Text>
              <Text style={styles.tablePrice}>{formatPrice(product.price)}</Text>
              <Pressable
                style={[styles.adminSwitch, product.available && styles.adminSwitchActive]}
                onPress={() => void toggleAvailability(product.id)}
              >
                <View style={[styles.adminSwitchKnob, product.available && styles.adminSwitchKnobActive]} />
              </Pressable>
              <View style={styles.adminInlineActions}>
                <Pressable onPress={() => startEdit(product)}><Text style={styles.actionIconText}>✎</Text></Pressable>
                <Pressable onPress={() => void removeProduct(product.id)}><Text style={styles.deleteIconText}>🗑</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function CategoriesAdmin({
  categories,
  setCategories,
  products,
  setProducts,
  restaurants,
  onCategoryPersist,
  onCategoryDelete,
  onProductPersist,
}: {
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  products: Product[];
  setProducts: (products: Product[]) => void;
  restaurants: Restaurant[];
  onCategoryPersist: (category: Category, index: number) => Promise<void>;
  onCategoryDelete: (categoryId: string) => Promise<void>;
  onProductPersist: (product: Product) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🍽');
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>(restaurants.map((restaurant) => restaurant.id));
  const toggleRestaurantAssignment = (restaurantId: string) => {
    setSelectedRestaurantIds((current) =>
      current.includes(restaurantId) ? current.filter((id) => id !== restaurantId) : [...current, restaurantId],
    );
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setLabel('');
    setDescription('');
    setIcon('🍽');
    setSelectedRestaurantIds(restaurants.map((restaurant) => restaurant.id));
  };
  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setLabel(category.label);
    setDescription(category.description);
    setIcon(category.icon);
    setSelectedRestaurantIds(category.restaurantIds?.length ? category.restaurantIds : restaurants.map((restaurant) => restaurant.id));
    setIsEditing(true);
  };
  const saveCategory = async () => {
    const nextLabel = label.trim();
    if (!nextLabel) {
      Alert.alert('Catégorie incomplète', 'Renseigne un nom de catégorie.');
      return;
    }
    const existingCategory = categories.find((category) => category.label.toLowerCase() === nextLabel.toLowerCase() && category.id !== editingId);
    if (existingCategory) {
      Alert.alert('Catégorie déjà existante', 'Une catégorie avec ce nom existe déjà.');
      return;
    }
    if (!selectedRestaurantIds.length) {
      Alert.alert('Restaurant manquant', 'Sélectionne au moins un restaurant pour cette catégorie.');
      return;
    }
    const oldCategory = categories.find((category) => category.id === editingId);
    const nextCategory: Category = {
      id: nextLabel,
      label: nextLabel,
      description: description.trim() || 'Description à compléter',
      icon: icon.trim() || '🍽',
      restaurantIds: selectedRestaurantIds,
    };
    const nextCategories = editingId ? categories.map((category) => (category.id === editingId ? nextCategory : category)) : [...categories, nextCategory];
    const updatedProducts = oldCategory && oldCategory.label !== nextCategory.label
      ? products.map((product) => (product.category === oldCategory.label ? { ...product, category: nextCategory.label } : product))
      : products;
    setCategories(nextCategories);
    if (updatedProducts !== products) {
      setProducts(updatedProducts);
    }
    try {
      await onCategoryPersist(nextCategory, nextCategories.findIndex((category) => category.id === nextCategory.id));
      if (oldCategory && oldCategory.label !== nextCategory.label) {
        await Promise.all(updatedProducts.filter((product) => product.category === nextCategory.label).map(onProductPersist));
        await onCategoryDelete(oldCategory.id);
      }
    } catch (error) {
      showSupabaseAdminError(error);
    }
    resetForm();
  };
  const deleteCategory = async (category: Category) => {
    if (categories.length <= 1) {
      Alert.alert('Action impossible', 'Il faut garder au moins une catégorie.');
      return;
    }
    const fallbackCategory = categories.find((item) => item.id !== category.id)?.label ?? 'Entrées';
    const nextCategories = categories.filter((item) => item.id !== category.id);
    const nextProducts = products.map((product) => (product.category === category.label ? { ...product, category: fallbackCategory } : product));
    const productsToMove = nextProducts.filter((product) => product.category === fallbackCategory && products.some((item) => item.id === product.id && item.category === category.label));
    setCategories(nextCategories);
    setProducts(nextProducts);
    try {
      await Promise.all(productsToMove.map(onProductPersist));
      await onCategoryDelete(category.id);
      Alert.alert('Catégorie supprimée', productsToMove.length ? `Les plats associés ont été déplacés vers ${fallbackCategory}.` : 'La catégorie a bien été supprimée.');
    } catch (error) {
      showSupabaseAdminError(error);
    }
  };

  return (
    <View>
      <AdminTitle title="Gestion des catégories" action="+ Ajouter une catégorie" onAction={() => setIsEditing(true)} />
      {isEditing ? (
        <View style={styles.adminFormCard}>
          <Text style={styles.adminFormTitle}>{editingId ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</Text>
          <AdminField label="Nom" value={label} onChangeText={setLabel} />
          <AdminField label="Description" value={description} onChangeText={setDescription} multiline />
          <AdminField label="Icône" value={icon} onChangeText={setIcon} />
          <View>
            <Text style={styles.inputLabel}>Restaurants où cette catégorie apparaît</Text>
            <View style={styles.adminRestaurantAssignGrid}>
              {restaurants.map((restaurant) => {
                const active = selectedRestaurantIds.includes(restaurant.id);
                return (
                  <Pressable
                    key={restaurant.id}
                    style={[styles.restaurantAssignPill, active && styles.restaurantAssignPillActive]}
                    onPress={() => toggleRestaurantAssignment(restaurant.id)}
                  >
                    <Text style={[styles.restaurantAssignText, active && styles.restaurantAssignTextActive]}>{restaurant.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.adminInlineActions}>
            <Pressable style={styles.actionButton} onPress={() => void saveCategory()}><Text style={styles.actionButtonText}>Enregistrer</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={resetForm}><Text style={styles.secondaryButtonText}>Annuler</Text></Pressable>
          </View>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminTableScrollContent}>
        <View style={[styles.tableCard, styles.tableCardWide]}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.tableNameCell]}>Catégorie</Text>
            <Text style={[styles.tableHeaderText, styles.tableProduct]}>Description</Text>
            <Text style={[styles.tableHeaderText, styles.tablePrice]}>Image</Text>
            <Text style={styles.tableHeaderActions}>Actions</Text>
          </View>
          {categories.map((category) => (
            <View key={category.id} style={styles.tableRow}>
              <Text style={[styles.tablePrimary, styles.tableNameCell]}>{category.label}</Text>
              <View style={styles.tableProduct}>
                <Text style={styles.tableSub}>{category.description}</Text>
                <Text style={styles.tableSub}>
                  Restaurants : {category.restaurantIds?.length
                    ? restaurants.filter((restaurant) => category.restaurantIds?.includes(restaurant.id)).map((restaurant) => restaurant.name.replace('Allo Couscous ', '')).join(', ')
                    : 'Tous'}
                </Text>
              </View>
              <Text style={styles.tablePrice}>{category.icon}</Text>
              <View style={styles.adminInlineActions}>
                <Pressable onPress={() => startEdit(category)}><Text style={styles.actionIconText}>✎</Text></Pressable>
                <Pressable onPress={() => void deleteCategory(category)}><Text style={styles.deleteIconText}>🗑</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function RestaurantsAdmin({
  restaurants,
  setRestaurants,
  onRestaurantPersist,
}: {
  restaurants: Restaurant[];
  setRestaurants: (restaurants: Restaurant[]) => void;
  onRestaurantPersist: (restaurant: Restaurant) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(restaurants[0]?.id ?? 'lille');
  const currentRestaurant = editingId ? restaurants.find((restaurant) => restaurant.id === editingId) ?? restaurants[0] : null;
  const [name, setName] = useState(currentRestaurant?.name ?? '');
  const [address, setAddress] = useState(currentRestaurant?.address ?? '');
  const [phone, setPhone] = useState(currentRestaurant?.phone ?? '');
  const [hours, setHours] = useState(currentRestaurant?.hours ?? '11:00-14:00 · 17:00-21:00');
  const [capacity, setCapacity] = useState(String(currentRestaurant?.capacityPerSlot ?? 4));
  const [closedUntil, setClosedUntil] = useState(currentRestaurant?.exceptionalClosedUntil ?? '');
  const [schedule, setSchedule] = useState<RestaurantScheduleDay[]>(
    normalizeRestaurantSchedule(currentRestaurant ?? restaurants[0] ?? { hours: '11:00-14:00 · 17:00-21:00' }),
  );
  const [formDirty, setFormDirty] = useState(false);
  const loadedRestaurantIdRef = useRef<string | null>(editingId);

  const loadRestaurantForm = (restaurant: Restaurant) => {
    setName(restaurant.name);
    setAddress(restaurant.address);
    setPhone(restaurant.phone);
    setHours(restaurant.hours);
    setCapacity(String(restaurant.capacityPerSlot));
    setClosedUntil(restaurant.exceptionalClosedUntil ?? '');
    setSchedule(normalizeRestaurantSchedule(restaurant));
    setFormDirty(false);
    loadedRestaurantIdRef.current = restaurant.id;
  };

  useEffect(() => {
    if (!editingId) return;
    const restaurant = restaurants.find((item) => item.id === editingId);
    if (!restaurant) return;
    const isNewSelection = loadedRestaurantIdRef.current !== editingId;
    if (!isNewSelection && formDirty) return;
    loadRestaurantForm(restaurant);
  }, [editingId, restaurants, formDirty]);

  useEffect(() => {
    setHours(buildHoursSummary(schedule));
  }, [schedule]);

  const persistRestaurant = async (nextRestaurant: Restaurant) => {
    const exists = restaurants.some((restaurant) => restaurant.id === nextRestaurant.id);
    try {
      if (isSupabaseConfigured) {
        await onRestaurantPersist(nextRestaurant);
      }
      setRestaurants(exists ? restaurants.map((restaurant) => (restaurant.id === nextRestaurant.id ? nextRestaurant : restaurant)) : [...restaurants, nextRestaurant]);
      setFormDirty(false);
      loadedRestaurantIdRef.current = nextRestaurant.id;
      return true;
    } catch (error) {
      showSupabaseAdminError(error);
      return false;
    }
  };

  const startNewRestaurant = () => {
    setEditingId(null);
    setName('');
    setAddress('');
    setPhone('');
    setHours('11:00-14:00 · 17:00-21:00');
    setCapacity('4');
    setClosedUntil('');
    setSchedule(getDefaultScheduleFromHours('11:00-14:00 · 17:00-21:00'));
    setFormDirty(true);
    loadedRestaurantIdRef.current = null;
  };

  const updateScheduleDay = (dayId: string, updates: Partial<RestaurantScheduleDay>) => {
    setFormDirty(true);
    setSchedule((current) => current.map((day) => (day.id === dayId ? { ...day, ...updates } : day)));
  };

  const saveRestaurant = async () => {
    if (!name.trim() || !address.trim() || !phone.trim()) {
      Alert.alert('Restaurant incomplet', 'Renseigne le nom, l’adresse et le téléphone.');
      return;
    }
    const nextCapacity = Number(capacity);
    const restaurantId = editingId ?? name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!restaurantId) {
      Alert.alert('Nom invalide', 'Le nom du restaurant ne permet pas de créer un identifiant.');
      return;
    }
    const normalizedSchedule = normalizeRestaurantSchedule({ hours: buildHoursSummary(schedule), schedule });
    const nextRestaurant = {
      id: restaurantId,
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      hours: buildHoursSummary(normalizedSchedule),
      schedule: normalizedSchedule,
      isOpen: currentRestaurant?.isOpen ?? false,
      nextSlot: currentRestaurant?.nextSlot ?? '17:00',
      capacityPerSlot: Number.isNaN(nextCapacity) || nextCapacity < 1 ? 4 : nextCapacity,
      acceptingOrders: currentRestaurant?.acceptingOrders ?? true,
      exceptionalClosedUntil: closedUntil.trim(),
      archived: currentRestaurant?.archived ?? false,
    };
    const saved = await persistRestaurant(nextRestaurant);
    if (!saved) {
      return;
    }
    setEditingId(nextRestaurant.id);
    Alert.alert('Restaurant enregistré', 'Les paramètres du restaurant sont sauvegardés.');
  };

  const togglePause = async (restaurant: Restaurant) => {
    const shouldResume = restaurant.acceptingOrders === false;
    const nextRestaurant = {
      ...restaurant,
      acceptingOrders: shouldResume,
      exceptionalClosedUntil: shouldResume ? '' : restaurant.exceptionalClosedUntil,
    };
    if (shouldResume && editingId === restaurant.id) {
      setClosedUntil('');
    }
    await persistRestaurant(nextRestaurant);
  };

  const toggleTodayClosure = async (restaurant: Restaurant) => {
    if (hasActiveExceptionalClosure(restaurant)) {
      const nextRestaurant = { ...restaurant, acceptingOrders: true, exceptionalClosedUntil: '' };
      if (editingId === restaurant.id) {
        setClosedUntil('');
      }
      await persistRestaurant(nextRestaurant);
      return;
    }
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 0, 0);
    const nextClosedUntil = endOfDay.toISOString();
    if (editingId === restaurant.id) {
      setClosedUntil(nextClosedUntil);
    }
    await persistRestaurant({ ...restaurant, exceptionalClosedUntil: nextClosedUntil });
  };

  const toggleArchive = async (restaurant: Restaurant) => {
    if (!restaurant.archived && restaurants.filter((item) => !item.archived).length <= 1) {
      Alert.alert('Action impossible', 'Il faut garder au moins un restaurant visible côté client.');
      return;
    }
    await persistRestaurant({
      ...restaurant,
      archived: !restaurant.archived,
      acceptingOrders: restaurant.archived ? restaurant.acceptingOrders : false,
    });
  };

  return (
    <View>
      <AdminTitle title="Paramètres restaurants" action="+ Ajouter un restaurant" onAction={startNewRestaurant} />
      <View style={styles.restaurantSettingsGrid}>
        <View style={styles.adminFormCard}>
          <Text style={styles.adminFormTitle}>Restaurants</Text>
          {restaurants.map((restaurant) => {
            const liveRestaurant = getRestaurantStatus(restaurant);
            const isExceptionallyClosed = hasActiveExceptionalClosure(restaurant);
            const statusLabel = restaurant.archived
              ? 'Archivé'
              : restaurant.acceptingOrders === false
              ? 'Pause'
              : isExceptionallyClosed
                ? 'Fermé aujourd’hui'
                : liveRestaurant.isOpen
                  ? 'Ouvert'
                  : 'Fermé';
            return (
              <Pressable
                key={restaurant.id}
                style={[styles.restaurantSettingsItem, editingId === restaurant.id && styles.restaurantSettingsItemActive]}
                onPress={() => setEditingId(restaurant.id)}
              >
                <View style={styles.flex}>
                  <Text style={styles.tablePrimary}>{restaurant.name}</Text>
                  <Text style={styles.tableSub}>{restaurant.address}</Text>
                </View>
                <Text style={[styles.activeLabel, (restaurant.archived || restaurant.acceptingOrders === false || isExceptionallyClosed) && styles.inactiveLabel]}>
                  {statusLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.adminFormCard}>
          <Text style={styles.adminFormTitle}>{editingId ? currentRestaurant?.name : 'Nouveau restaurant'}</Text>
          <AdminField label="Nom du restaurant" value={name} onChangeText={(value) => { setName(value); setFormDirty(true); }} />
          <AdminField label="Adresse" value={address} onChangeText={(value) => { setAddress(value); setFormDirty(true); }} />
          <AdminField label="Téléphone" value={phone} onChangeText={(value) => { setPhone(value); setFormDirty(true); }} />
          <View style={styles.adminFormCardNested}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.adminFormTitle}>Horaires par jour</Text>
                <Text style={styles.helperText}>Les créneaux client sont générés automatiquement à partir de ces services.</Text>
              </View>
              <Text style={styles.activeLabel}>{hours}</Text>
            </View>
            <View style={styles.scheduleGrid}>
              {schedule.map((day) => (
                <View key={day.id} style={[styles.scheduleRow, day.closed && styles.scheduleRowClosed]}>
                  <Pressable style={[styles.scheduleClosedToggle, day.closed && styles.scheduleClosedToggleActive]} onPress={() => updateScheduleDay(day.id, { closed: !day.closed })}>
                    <Text style={[styles.scheduleClosedText, day.closed && styles.scheduleClosedTextActive]}>{day.closed ? 'Fermé' : 'Ouvert'}</Text>
                  </Pressable>
                  <Text style={styles.scheduleDayLabel}>{day.label}</Text>
                  <View style={styles.scheduleTimeGroup}>
                    <TextInput
                      style={[styles.input, styles.scheduleInput]}
                      value={day.lunchStart}
                      onChangeText={(value) => updateScheduleDay(day.id, { lunchStart: value })}
                      placeholder="11:00"
                      editable={!day.closed}
                    />
                    <Text style={styles.scheduleSeparator}>-</Text>
                    <TextInput
                      style={[styles.input, styles.scheduleInput]}
                      value={day.lunchEnd}
                      onChangeText={(value) => updateScheduleDay(day.id, { lunchEnd: value })}
                      placeholder="14:00"
                      editable={!day.closed}
                    />
                  </View>
                  <View style={styles.scheduleTimeGroup}>
                    <TextInput
                      style={[styles.input, styles.scheduleInput]}
                      value={day.dinnerStart}
                      onChangeText={(value) => updateScheduleDay(day.id, { dinnerStart: value })}
                      placeholder="17:00"
                      editable={!day.closed}
                    />
                    <Text style={styles.scheduleSeparator}>-</Text>
                    <TextInput
                      style={[styles.input, styles.scheduleInput]}
                      value={day.dinnerEnd}
                      onChangeText={(value) => updateScheduleDay(day.id, { dinnerEnd: value })}
                      placeholder="21:00"
                      editable={!day.closed}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.adminFormRow}>
            <View style={styles.flex}><AdminField label="Capacité par créneau" value={capacity} onChangeText={(value) => { setCapacity(value); setFormDirty(true); }} keyboardType="number-pad" /></View>
            <View style={styles.flex}><AdminField label="Fermé jusqu’à (ISO optionnel)" value={closedUntil} onChangeText={(value) => { setClosedUntil(value); setFormDirty(true); }} /></View>
          </View>
          <View style={styles.adminInlineActions}>
            <Pressable style={styles.actionButton} onPress={() => void saveRestaurant()}><Text style={styles.actionButtonText}>Enregistrer</Text></Pressable>
            {currentRestaurant ? (
              <>
                <Pressable style={styles.secondaryButton} onPress={() => void togglePause(currentRestaurant)}>
                  <Text style={styles.secondaryButtonText}>{currentRestaurant.acceptingOrders === false ? 'Reprendre commandes' : 'Pause commandes'}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void toggleTodayClosure(currentRestaurant)}>
                  <Text style={styles.secondaryButtonText}>{hasActiveExceptionalClosure(currentRestaurant) ? 'Rouvrir aujourd’hui' : 'Fermeture aujourd’hui'}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void toggleArchive(currentRestaurant)}>
                  <Text style={styles.secondaryButtonText}>{currentRestaurant.archived ? 'Restaurer le restaurant' : 'Archiver le restaurant'}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
          <Text style={styles.helperText}>La fermeture exceptionnelle peut rester vide. Les commandes sont proposées jusqu’à 7 jours avant, uniquement sur les jours ouverts.</Text>
        </View>
      </View>
    </View>
  );
}

function StatsAdmin({ orders }: { orders: Order[] }) {
  const sales = orders.filter((order) => order.status !== 'Annulée').reduce((sum, order) => sum + order.total, 0);
  return (
    <View>
      <AdminTitle title="Statistiques" action="7 derniers jours" />
      <View style={styles.statsGrid}>
        <StatCard label="Ventes" value={formatPrice(sales)} />
        <StatCard label="Commandes" value={`${orders.length}`} />
        <StatCard label="Panier moyen" value={formatPrice(orders.length ? sales / orders.length : 0)} />
        <StatCard label="Fidélité" value="10 pts" />
      </View>
    </View>
  );
}

function OffersAdmin({
  offers,
  setOffers,
  onOfferPersist,
  onOfferDelete,
}: {
  offers: OfferConfig[];
  setOffers: (offers: OfferConfig[]) => void;
  onOfferPersist: (offer: OfferConfig) => Promise<void>;
  onOfferDelete: (offerId: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState(tajineImage);
  const [savedMessage, setSavedMessage] = useState('');
  const [imageUploadStatus, setImageUploadStatus] = useState('');

  const imageComesFromDevice = image.startsWith('data:image/');
  const imageStoredInSupabase = image.includes(`/storage/v1/object/public/${productImagesBucket}/`);

  const startNewOffer = () => {
    setEditingId(null);
    setTitle('');
    setText('');
    setImage(tajineImage);
    setSavedMessage('');
    setImageUploadStatus('');
    setIsEditing(true);
  };

  const startEditing = (offer: OfferConfig) => {
    setEditingId(offer.id);
    setTitle(offer.title);
    setText(offer.text);
    setImage(offer.image || tajineImage);
    setSavedMessage('');
    setImageUploadStatus('');
    setIsEditing(true);
  };

  const handlePickOfferImage = () => {
    pickImageFromDevice(async (imageDataUrl) => {
      setImage(imageDataUrl);
      setImageUploadStatus(isSupabaseConfigured ? 'Envoi de la photo vers Supabase...' : 'Photo prête localement.');
      if (!isSupabaseConfigured) {
        return;
      }
      try {
        const publicUrl = await uploadImageToSupabaseStorage(imageDataUrl, 'offers');
        setImage(publicUrl);
        setImageUploadStatus('Photo envoyée dans Supabase Storage.');
      } catch (error) {
        setImageUploadStatus('Photo conservée localement. Vérifie le bucket Supabase Storage.');
        showSupabaseAdminError(error);
      }
    });
  };

  const saveOffer = async () => {
    if (!title.trim() || !text.trim() || !image.trim()) {
      Alert.alert('Offre incomplète', 'Renseigne un titre, un texte et une image.');
      return;
    }
    const nextOffer: OfferConfig = {
      id: editingId ?? `offer-${Date.now()}`,
      title: title.trim(),
      text: text.trim(),
      image: image.trim(),
      active: true,
    };
    setOffers(editingId ? offers.map((offer) => (offer.id === editingId ? nextOffer : offer)) : [nextOffer, ...offers]);
    try {
      await onOfferPersist(nextOffer);
    } catch (error) {
      showSupabaseAdminError(error);
    }
    setSavedMessage(editingId ? 'Offre modifiée sur la page d’accueil.' : 'Nouvelle offre ajoutée sur la page d’accueil.');
    setIsEditing(false);
  };
  const toggleOffer = async (offer: OfferConfig) => {
    const nextOffer = { ...offer, active: !offer.active };
    const nextOffers = offers.map((item) => (item.id === offer.id ? nextOffer : item));
    setOffers(nextOffers);
    try {
      await onOfferPersist(nextOffer);
    } catch (error) {
      showSupabaseAdminError(error);
    }
    setSavedMessage(offer.active ? 'Offre désactivée sur l’accueil.' : 'Offre activée sur l’accueil.');
  };
  const removeOffer = async (offerId: string) => {
    setOffers(offers.filter((item) => item.id !== offerId));
    try {
      await onOfferDelete(offerId);
    } catch (error) {
      showSupabaseAdminError(error);
    }
    setSavedMessage('Offre supprimée de la page d’accueil.');
  };

  return (
    <View>
      <AdminTitle title="Gestion des offres" action="+ Nouvelle offre" onAction={startNewOffer} />
      {savedMessage ? <Text style={styles.adminSuccessMessage}>{savedMessage}</Text> : null}
      {isEditing ? (
        <View style={styles.adminFormCard}>
          <Text style={styles.adminFormTitle}>{editingId ? 'Modifier l’offre d’accueil' : 'Nouvelle offre d’accueil'}</Text>
          <AdminField label="Titre" value={title} onChangeText={setTitle} />
          <AdminField label="Texte" value={text} onChangeText={setText} multiline />
          <Text style={styles.inputLabel}>Image de l’offre</Text>
          <View style={styles.adminImageActions}>
            <Pressable style={styles.actionButton} onPress={handlePickOfferImage}>
              <Text style={styles.actionButtonText}>Choisir une photo</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setImage(tajineImage);
                setImageUploadStatus('');
              }}
            >
              <Text style={styles.secondaryButtonText}>Image par défaut</Text>
            </Pressable>
          </View>
          {imageUploadStatus ? <Text style={styles.adminSuccessMessage}>{imageUploadStatus}</Text> : null}
          {imageStoredInSupabase ? (
            <View style={styles.adminSelectedImageNotice}>
              <Text style={styles.tablePrimary}>Photo stockée dans Supabase Storage</Text>
              <Text style={styles.tableSub}>L’offre enregistrera une URL publique légère et rapide.</Text>
            </View>
          ) : imageComesFromDevice ? (
            <View style={styles.adminSelectedImageNotice}>
              <Text style={styles.tablePrimary}>Photo importée depuis votre appareil</Text>
              <Text style={styles.tableSub}>Elle sera enregistrée avec l’offre. Pour la production, vérifie que le bucket Storage est actif.</Text>
            </View>
          ) : (
            <AdminField label="Ou coller une URL d’image" value={image} onChangeText={setImage} />
          )}
          <View style={styles.adminImagePreview}>
            <Image source={{ uri: image || tajineImage }} style={styles.adminImagePreviewImage} />
            <View style={styles.flex}>
              <Text style={styles.tablePrimary}>Aperçu de l’image</Text>
              <Text style={styles.tableSub}>Choisis une photo depuis l’appareil ou colle une URL.</Text>
            </View>
          </View>
          <View style={styles.adminInlineActions}>
            <Pressable style={styles.actionButton} onPress={() => void saveOffer()}><Text style={styles.actionButtonText}>Enregistrer</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setIsEditing(false)}><Text style={styles.secondaryButtonText}>Annuler</Text></Pressable>
          </View>
        </View>
      ) : null}
      {offers.map((offer) => (
        <View key={offer.id} style={styles.adminListCard}>
          <Image source={{ uri: offer.image || tajineImage }} style={styles.adminThumb} />
          <View style={styles.flex}>
            <Text style={styles.tablePrimary}>{offer.title}</Text>
            <Text style={styles.tableSub}>{offer.text}</Text>
          </View>
          <Pressable
            style={[styles.adminSwitch, offer.active && styles.adminSwitchActive]}
            onPress={() => void toggleOffer(offer)}
          >
            <View style={[styles.adminSwitchKnob, offer.active && styles.adminSwitchKnobActive]} />
          </Pressable>
          <View style={styles.adminInlineActions}>
            <Pressable onPress={() => startEditing(offer)}><Text style={styles.actionIconText}>✎</Text></Pressable>
            <Pressable
              onPress={() => void removeOffer(offer.id)}
            >
              <Text style={styles.deleteIconText}>🗑</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function CouponsAdmin({
  coupon,
  setCoupon,
  onCouponPersist,
}: {
  coupon: CouponConfig;
  setCoupon: (coupon: CouponConfig) => void;
  onCouponPersist: (coupon: CouponConfig) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [code, setCode] = useState(coupon.code);
  const [value, setValue] = useState(String(coupon.value));
  const [minAmount, setMinAmount] = useState(String(coupon.minAmount));
  const [maxUses, setMaxUses] = useState(String(coupon.maxUses));
  const saveCoupon = async () => {
    const parsedValue = Number(value.replace(',', '.'));
    const parsedMin = Number(minAmount.replace(',', '.'));
    const parsedMax = Number(maxUses);
    if (!code.trim() || Number.isNaN(parsedValue) || parsedValue <= 0) {
      Alert.alert('Coupon incomplet', 'Renseigne un code et une remise valide.');
      return;
    }
    const nextCoupon = {
      ...coupon,
      code: code.trim().toUpperCase(),
      value: parsedValue,
      minAmount: Number.isNaN(parsedMin) ? 0 : parsedMin,
      maxUses: Number.isNaN(parsedMax) ? 1 : parsedMax,
      active: true,
    };
    setCoupon(nextCoupon);
    try {
      await onCouponPersist(nextCoupon);
    } catch (error) {
      showSupabaseAdminError(error);
    }
    setIsEditing(false);
  };
  const toggleCoupon = async () => {
    const nextCoupon = { ...coupon, active: !coupon.active };
    setCoupon(nextCoupon);
    try {
      await onCouponPersist(nextCoupon);
    } catch (error) {
      showSupabaseAdminError(error);
    }
  };
  const disableCoupon = async () => {
    const nextCoupon = { ...coupon, active: false };
    setCoupon(nextCoupon);
    try {
      await onCouponPersist(nextCoupon);
    } catch (error) {
      showSupabaseAdminError(error);
    }
  };

  return (
    <View>
      <AdminTitle title="Gestion des Coupons" action="+ Nouveau coupon" onAction={() => setIsEditing(true)} />
      {isEditing ? (
        <View style={styles.adminFormCard}>
          <Text style={styles.adminFormTitle}>Modifier le coupon</Text>
          <AdminField label="Code" value={code} onChangeText={setCode} />
          <View style={styles.adminFormRow}>
            <View style={styles.flex}><AdminField label="Remise (%)" value={value} onChangeText={setValue} keyboardType="decimal-pad" /></View>
            <View style={styles.flex}><AdminField label="Minimum (€)" value={minAmount} onChangeText={setMinAmount} keyboardType="decimal-pad" /></View>
          </View>
          <AdminField label="Limite d’utilisation" value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" />
          <View style={styles.adminInlineActions}>
            <Pressable style={styles.actionButton} onPress={() => void saveCoupon()}><Text style={styles.actionButtonText}>Enregistrer</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setIsEditing(false)}><Text style={styles.secondaryButtonText}>Annuler</Text></Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.adminListCard}>
        <View style={styles.percentCircle}><Text style={styles.percentText}>%</Text></View>
        <View style={styles.flex}>
          <View style={styles.inlineActions}>
            <Text style={styles.tablePrimary}>{coupon.code}</Text>
            <Text style={[styles.activeLabel, !coupon.active && styles.inactiveLabel]}>{coupon.active ? 'Actif' : 'Inactif'}</Text>
          </View>
          <Text style={styles.tableSub}>
            -{coupon.value}{coupon.type === 'percent' ? '%' : '€'} · min. {formatPrice(coupon.minAmount)} · {coupon.used}/{coupon.maxUses} utilisations
          </Text>
        </View>
        <Pressable style={[styles.adminSwitch, coupon.active && styles.adminSwitchActive]} onPress={() => void toggleCoupon()}>
          <View style={[styles.adminSwitchKnob, coupon.active && styles.adminSwitchKnobActive]} />
        </Pressable>
        <View style={styles.adminInlineActions}>
          <Pressable onPress={() => setIsEditing(true)}><Text style={styles.actionIconText}>✎</Text></Pressable>
          <Pressable onPress={() => void disableCoupon()}><Text style={styles.deleteIconText}>🗑</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function NotificationsAdmin({
  emailCampaigns,
  setEmailCampaigns,
  offerPushCampaigns,
  setOfferPushCampaigns,
  pushDiagnostics,
  onMarketingEmail,
  onMarketingPush,
  onPushRefresh,
}: {
  emailCampaigns: PushCampaign[];
  setEmailCampaigns: (campaigns: PushCampaign[]) => void;
  offerPushCampaigns: OfferPushCampaign[];
  setOfferPushCampaigns: (campaigns: OfferPushCampaign[]) => void;
  pushDiagnostics: PushDiagnostics | null;
  onMarketingEmail: (campaign: PushCampaign) => Promise<boolean>;
  onMarketingPush: (campaign: OfferPushCampaign) => Promise<CampaignSendResult>;
  onPushRefresh: (silent?: boolean) => Promise<void>;
}) {
  const [title, setTitle] = useState('Une offre Allo Couscous vous attend');
  const [message, setMessage] = useState('Profitez de nos plats du jour en click & collect.');
  const [audience, setAudience] = useState('Tous les clients');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingPush, setSendingPush] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{ variant: 'error' | 'success'; text: string } | null>(null);
  const audiences = ['Tous les clients', 'Clients fidèles', 'Lille', 'Armentières'];
  const createdAt = () =>
    new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const sendEmailCampaign = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Campagne incomplète', 'Renseigne un titre et un message.');
      return;
    }
    const campaign: PushCampaign = {
      id: `email-${Date.now()}`,
      title: title.trim(),
      message: message.trim(),
      audience,
      createdAt: createdAt(),
    };
    setSendingEmail(true);
    const sent = await onMarketingEmail(campaign);
    setSendingEmail(false);
    if (sent) {
      setEmailCampaigns([campaign, ...emailCampaigns]);
      Alert.alert('Email publicité envoyé', 'La campagne a été envoyée uniquement aux clients qui ont accepté les offres par email.');
    }
  };

  const sendPushOfferCampaign = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Campagne incomplète', 'Renseigne un titre et un message.');
      return;
    }
    const campaign: OfferPushCampaign = {
      id: `offer-push-${Date.now()}`,
      title: title.trim(),
      message: message.trim(),
      audience,
      createdAt: createdAt(),
    };
    setSendingPush(true);
    setPushFeedback(null);
    const result = await onMarketingPush(campaign);
    await onPushRefresh(true);
    setSendingPush(false);
    setPushFeedback({ variant: result.ok ? 'success' : 'error', text: result.message });
  };

  return (
    <View>
      <View style={styles.adminFormCard}>
        <View style={styles.pushDiagnosticHeader}>
          <Text style={styles.adminFormTitle}>Diagnostic push mobile</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void onPushRefresh(false)}>
            <Text style={styles.secondaryButtonText}>Actualiser</Text>
          </Pressable>
        </View>
        <View style={styles.pushDiagnosticGrid}>
          <StatCard label="clients consentants" value={`${pushDiagnostics?.consentingProfiles ?? 0}`} />
          <StatCard label="téléphones enregistrés" value={`${pushDiagnostics?.marketingTokens ?? 0}`} />
          <StatCard label="téléphones actifs" value={`${pushDiagnostics?.enabledMarketingTokens ?? 0}`} />
        </View>
        {pushDiagnostics?.enabledMarketingTokens ? (
          <Text style={styles.helperText}>Dernière vérification : {pushDiagnostics.lastCheckedAt}</Text>
        ) : (
          <View style={[styles.formBanner, styles.formBannerError]}>
            <Text style={styles.formBannerErrorText}>
              Aucun téléphone actif n’est enregistré. Le client doit ouvrir la dernière version installée, se connecter, cocher les notifications push offres
              dans Profil, puis appuyer sur Enregistrer.
            </Text>
          </View>
        )}
        {pushDiagnostics?.error ? (
          <View style={[styles.formBanner, styles.formBannerError]}>
            <Text style={styles.formBannerErrorText}>Diagnostic Supabase : {pushDiagnostics.error}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.adminFormCard}>
        <Text style={styles.adminFormTitle}>Nouvelle campagne (email et / ou push)</Text>
        <AdminField label="Titre" value={title} onChangeText={setTitle} />
        <AdminField label="Message" value={message} onChangeText={setMessage} multiline />
        <Text style={styles.inputLabel}>Cible</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminCategoryFilters}>
          {audiences.map((item) => (
            <Pressable key={item} style={[styles.categoryFilter, audience === item && styles.categoryFilterActive]} onPress={() => setAudience(item)}>
              <Text style={[styles.categoryFilterText, audience === item && styles.categoryFilterTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.helperText}>
          Email : clients ayant accepté les offres par email. Push : clients ayant accepté les notifications push offres sur l’app mobile (limite ~500 profils
          par envoi).
        </Text>
        <View style={styles.adminFormRow}>
          <View style={styles.flex}>
            <Pressable
              style={[styles.primaryButton, sendingEmail && styles.buttonDisabled]}
              onPress={() => void sendEmailCampaign()}
            >
              <Text style={styles.primaryButtonText}>{sendingEmail ? 'Envoi email...' : 'Envoyer email'}</Text>
            </Pressable>
          </View>
          <View style={styles.flex}>
            <Pressable
              style={[styles.secondaryButton, sendingPush && styles.buttonDisabled]}
              onPress={() => void sendPushOfferCampaign()}
            >
              <Text style={styles.secondaryButtonText}>{sendingPush ? 'Envoi push...' : 'Envoyer push offres'}</Text>
            </Pressable>
          </View>
        </View>
        {pushFeedback ? (
          <View style={[styles.formBanner, pushFeedback.variant === 'error' ? styles.formBannerError : styles.formBannerSuccess]}>
            <Text style={pushFeedback.variant === 'error' ? styles.formBannerErrorText : styles.formBannerSuccessText}>
              {pushFeedback.text}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Historique emails publicité</Text>
      <View style={styles.tableCard}>
        {!emailCampaigns.length ? <Text style={styles.adminEmptySmall}>Aucune campagne email</Text> : null}
        {emailCampaigns.map((campaign) => (
          <View key={campaign.id} style={styles.tableRow}>
            <View style={styles.tableProduct}>
              <Text style={styles.tablePrimary}>{campaign.title}</Text>
              <Text style={styles.tableSub}>{campaign.message}</Text>
            </View>
            <Text style={styles.tableCell}>{campaign.audience}</Text>
            <Text style={styles.tableCell}>{campaign.createdAt}</Text>
            <Pressable onPress={() => setEmailCampaigns(emailCampaigns.filter((item) => item.id !== campaign.id))}>
              <Text style={styles.deleteIconText}>🗑</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Historique push offres</Text>
      <View style={styles.tableCard}>
        {!offerPushCampaigns.length ? <Text style={styles.adminEmptySmall}>Aucune campagne push</Text> : null}
        {offerPushCampaigns.map((campaign) => (
          <View key={campaign.id} style={styles.tableRow}>
            <View style={styles.tableProduct}>
              <Text style={styles.tablePrimary}>{campaign.title}</Text>
              <Text style={styles.tableSub}>{campaign.message}</Text>
            </View>
            <Text style={styles.tableCell}>{campaign.audience}</Text>
            <Text style={styles.tableCell}>{campaign.createdAt}</Text>
            <Pressable onPress={() => setOfferPushCampaigns(offerPushCampaigns.filter((item) => item.id !== campaign.id))}>
              <Text style={styles.deleteIconText}>🗑</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewsAdmin({
  reviews,
  orders,
  onReviewsRefresh,
}: {
  reviews: Review[];
  orders: Order[];
  onReviewsRefresh: () => Promise<void>;
}) {
  const averageRating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  const ratedReviews = reviews.filter((review) => review.rating > 0).length;
  const getReviewOrder = (review: Review) => orders.find((order) => order.id === review.orderId);

  return (
    <View>
      <AdminTitle title="Avis clients" action="Actualiser" onAction={() => void onReviewsRefresh()} />
      <View style={styles.statsGrid}>
        <StatCard label="Avis reçus" value={`${reviews.length}`} />
        <StatCard label="Note moyenne" value={reviews.length ? `${averageRating.toFixed(1)}/5` : '-'} />
        <StatCard label="Avis notés" value={`${ratedReviews}`} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminTableScrollContent}>
        <View style={[styles.tableCard, styles.tableCardWide]}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.tableProduct]}>Avis</Text>
            <Text style={[styles.tableHeaderText, styles.tableCell]}>Commande</Text>
            <Text style={[styles.tableHeaderText, styles.tableCell]}>Client</Text>
            <Text style={[styles.tableHeaderText, styles.tableCell]}>Date</Text>
          </View>
          {!reviews.length ? <Text style={styles.adminEmptySmall}>Aucun avis client pour le moment</Text> : null}
          {reviews.map((review) => {
            const order = getReviewOrder(review);
            return (
              <View key={review.id} style={styles.tableRow}>
                <View style={styles.tableProduct}>
                  <Text style={styles.tablePrimary}>{'★'.repeat(Math.max(0, Math.min(5, review.rating)))} {review.rating}/5</Text>
                  <Text style={styles.tableSub}>{review.comment.trim() || 'Sans commentaire'}</Text>
                </View>
                <View style={styles.tableCellBlock}>
                  <Text style={styles.tablePrimary}>{review.orderId}</Text>
                  {order ? <Text style={styles.tableSub}>{getRestaurant(order.restaurantId).name} · {getKitchenPickupDateLabel(order)}</Text> : null}
                </View>
                <View style={styles.tableCellBlock}>
                  <Text style={styles.tablePrimary}>{order?.customerName || 'Client'}</Text>
                  {order?.customerEmail ? <Text style={styles.tableSub}>{order.customerEmail}</Text> : null}
                </View>
                <Text style={styles.tableCell}>{review.createdAt}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function BottomNav({ current, cartCount, onNavigate }: { current: Screen; cartCount: number; onNavigate: (screen: Screen) => void }) {
  const items: { screen: Screen; label: string; icon: 'home' | 'menu' | 'bag' | 'clock' | 'user' }[] = [
    { screen: 'welcome', label: 'Accueil', icon: 'home' },
    { screen: 'restaurants', label: 'Menu', icon: 'menu' },
    { screen: 'cart', label: 'Panier', icon: 'bag' },
    { screen: 'profile', label: 'Profil', icon: 'user' },
  ];
  const activeScreen =
    current === 'menu' || current === 'restaurants'
      ? 'restaurants'
      : current === 'checkout'
        ? 'cart'
        : current === 'tracking'
          ? 'profile'
          : current;

  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const active = activeScreen === item.screen;
        return (
          <Pressable key={item.screen} style={styles.navItem} onPress={() => onNavigate(item.screen)}>
            <View style={styles.navIconSlot}>
              <TabIcon type={item.icon} active={active} />
            </View>
            <View style={styles.navLabelSlot}>
              <Text style={[styles.navLabel, active && styles.navActive]}>{item.label}</Text>
            </View>
            {item.screen === 'cart' && cartCount ? <View style={styles.navBadge}><Text style={styles.navBadgeText}>{cartCount}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ type, active }: { type: 'home' | 'menu' | 'bag' | 'clock' | 'user'; active: boolean }) {
  const iconColor = active ? colors.red : '#6b7280';

  if (type === 'home') {
    return (
      <View style={styles.tabIconBox}>
        <View style={[styles.homeRoof, { borderColor: iconColor }]} />
        <View style={[styles.homeBody, { borderColor: iconColor }]}>
          <View style={[styles.homeDoor, { borderColor: iconColor }]} />
        </View>
      </View>
    );
  }

  if (type === 'menu') {
    return (
      <View style={styles.tabIconBox}>
        <View style={[styles.menuIconLine, { backgroundColor: iconColor }]} />
        <View style={[styles.menuIconLine, { backgroundColor: iconColor }]} />
        <View style={[styles.menuIconLine, { backgroundColor: iconColor }]} />
      </View>
    );
  }

  if (type === 'bag') {
    return (
      <View style={styles.tabIconBox}>
        <View style={[styles.bagHandle, { borderColor: iconColor }]} />
        <View style={[styles.bagBody, { borderColor: iconColor }]}>
          <View style={[styles.bagSmile, { borderColor: iconColor }]} />
        </View>
      </View>
    );
  }

  if (type === 'clock') {
    return (
      <View style={styles.tabIconBox}>
        <View style={[styles.clockFace, { borderColor: iconColor }]}>
          <View style={[styles.clockHandVertical, { backgroundColor: iconColor }]} />
          <View style={[styles.clockHandHorizontal, { backgroundColor: iconColor }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabIconBox}>
      <View style={[styles.userHead, { borderColor: iconColor }]} />
      <View style={[styles.userShoulders, { borderColor: iconColor }]} />
    </View>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backButtonText}>‹</Text></Pressable>
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function InfoLine({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function PriceLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.priceLine}>
      <Text style={[styles.priceLabel, strong && styles.priceStrong]}>{label}</Text>
      <Text style={[styles.priceValue, strong && styles.priceStrong]}>{value}</Text>
    </View>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  editable?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        editable={props.editable}
        keyboardType={props.keyboardType}
        style={[styles.input, props.editable === false && styles.inputDisabled]}
      />
    </View>
  );
}

function AdminField(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        style={[styles.input, props.multiline && styles.adminTextArea]}
      />
    </View>
  );
}

function AdminTitle({ title, action, onAction }: { title: string; action: string; onAction?: () => void }) {
  return (
    <View style={styles.adminTitleRow}>
      <Text style={styles.adminTitle}>{title}</Text>
      <Pressable
        style={styles.adminActionButton}
        onPress={onAction ?? (() => Alert.alert('Action admin', 'Le formulaire complet sera branché avec la base de données.'))}
      >
        <Text style={styles.adminActionText}>{action}</Text>
      </Pressable>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function getTimelineCopy(status: OrderStatus) {
  switch (status) {
    case 'Nouvelle':
      return 'Commande reçue par le restaurant.';
    case 'Acceptée':
      return 'La cuisine a validé le créneau.';
    case 'En préparation':
      return 'Vos plats sont en cours de préparation.';
    case 'Prête':
      return 'Votre commande vous attend au retrait.';
    case 'Terminée':
      return 'Commande récupérée. Merci !';
    case 'Annulée':
      return 'Commande annulée ou refusée par le restaurant.';
    default:
      return '';
  }
}

function getAdminTabDescription(tab: AdminTab) {
  switch (tab) {
    case 'Cuisine':
      return 'Suivi opérationnel des commandes actives, par restaurant et par statut.';
    case 'Commandes':
      return 'Historique et pilotage des statuts de commande.';
    case 'Menu':
      return 'Gestion des plats, prix, images, disponibilité, allergènes et labels.';
    case 'Catégories':
      return 'Organisation du menu et ordre d’affichage côté client.';
    case 'Restaurants':
      return 'Horaires, capacité, pause commandes et fermetures exceptionnelles.';
    case 'Stats':
      return 'Indicateurs de vente essentiels pour suivre l’activité.';
    case 'Offres':
      return 'Bannières promotionnelles affichées sur la page d’accueil.';
    case 'Coupons':
      return 'Codes de réduction, limites d’utilisation et conditions.';
    case 'Notifications':
      return 'Campagnes email et notifications push « offres » vers les clients qui ont donné leur consentement.';
    case 'Avis':
      return 'Retours clients envoyés après une commande terminée.';
    default:
      return '';
  }
}

const compactFontStyles = <T extends Record<string, any>>(styleSheet: T): T => {
  const next: Record<string, any> = {};
  Object.keys(styleSheet).forEach((key) => {
    const value = styleSheet[key];
    if (value && typeof value === 'object' && typeof value.fontSize === 'number') {
      next[key] = {
        ...value,
        fontSize: Math.max(9, Math.round(value.fontSize * 0.72)),
      };
      return;
    }
    next[key] = value;
  });
  return next as T;
};

const styles = StyleSheet.create(compactFontStyles({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  crashScreen: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  crashLogo: {
    width: 150,
    height: 96,
    marginBottom: 20,
  },
  crashTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  crashText: {
    color: colors.red,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  crashHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  appShell: {
    flex: 1,
    backgroundColor: colors.surface,
    maxWidth: Platform.OS === 'web' ? 1180 : undefined,
    alignSelf: 'center',
    width: '100%',
  },
  adminAppShell: {
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  contentShell: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  startupSplash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1b0f0b',
  },
  startupSplashImage: {
    resizeMode: 'cover',
  },
  startupSplashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  startupSplashLogo: {
    width: 260,
    height: 170,
    maxWidth: '76%',
  },
  startupSplashText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
  },
  downloadLanding: {
    flex: 1,
    backgroundColor: '#160d0a',
  },
  downloadLandingImage: {
    resizeMode: 'cover',
  },
  downloadLandingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  downloadLandingCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 8,
  },
  downloadLandingAppLogo: {
    width: 74,
    height: 74,
    borderRadius: 18,
    marginBottom: 12,
  },
  downloadLandingLogo: {
    width: 220,
    height: 86,
    maxWidth: '86%',
    marginBottom: 12,
  },
  downloadLandingTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  downloadLandingText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 18,
  },
  downloadLandingHint: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  downloadPrimaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 5,
  },
  downloadPrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  downloadStoreRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  downloadStoreBadge: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
  },
  downloadStoreBadgeIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  downloadStoreBadgeCopy: {
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  downloadStoreBadgeEyebrow: {
    color: '#e5e7eb',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
  downloadStoreBadgeTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  downloadSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eadbd0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  downloadSecondaryButtonText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  downloadGhostButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#f6f1ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },
  downloadGhostButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  orderProgressBanner: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 12 : 44,
    paddingBottom: 10,
    gap: 8,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 10,
  },
  orderProgressBannerCancelled: {
    borderBottomColor: '#fecaca',
    backgroundColor: '#fff5f5',
  },
  orderProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderProgressTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  orderProgressMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  orderProgressStatus: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  orderProgressStatusCancelled: {
    color: '#991b1b',
  },
  orderProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
  },
  orderProgressSegment: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  orderProgressSegmentActive: {
    backgroundColor: colors.red,
  },
  orderProgressSegmentCancelled: {
    backgroundColor: '#991b1b',
  },
  orderProgressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderProgressStep: {
    flex: 1,
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  orderProgressLink: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '900',
  },
  globalHeader: {
    minHeight: 82,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  globalHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  globalHeaderBrand: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  globalHeaderTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 1,
  },
  globalHeaderSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.warm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    color: colors.ink,
    fontSize: 40,
    lineHeight: 42,
  },
  headerActionIcon: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 28,
  },
  headerBadge: {
    position: 'absolute',
    right: -2,
    top: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  fill: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  clientPageTopInset: {
    paddingTop: Platform.OS === 'web' ? 0 : 44,
  },
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  welcomeContent: {
    paddingBottom: 138,
  },
  hero: {
    height: 340,
    justifyContent: 'center',
  },
  heroImage: {
    resizeMode: 'cover',
  },
  heroOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.44)',
    paddingHorizontal: 20,
  },
  logoText: {
    color: '#fff',
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0,
  },
  logoTextSmall: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0,
  },
  heroLogo: {
    width: 360,
    maxWidth: '84%',
    height: 180,
    marginBottom: 20,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    maxWidth: 560,
  },
  restaurantHeroLogo: {
    width: 280,
    maxWidth: '78%',
    height: 120,
  },
  heroSubtitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: colors.action,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 12,
  },
  heroButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },
  heroButtonArrow: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 27,
  },
  homeQuickStats: {
    marginTop: -22,
    marginHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  homeQuickStat: {
    flex: 1,
    minHeight: 76,
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#edf0f3',
  },
  homeQuickValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  homeQuickLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
  },
  section: {
    padding: 14,
    paddingTop: 24,
    gap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smallIcon: {
    color: colors.red,
    fontSize: 26,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  offerCard: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    minHeight: 128,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  offerImage: {
    width: 132,
    height: '100%',
    minHeight: 128,
  },
  offerBody: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  offerTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  offerText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: colors.action,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonCompact: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    alignSelf: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
  },
  restaurantContent: {
    paddingTop: Platform.OS === 'web' ? 0 : 44,
    paddingBottom: 138,
  },
  restaurantHero: {
    height: 260,
  },
  restaurantList: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 128,
    gap: 12,
  },
  restaurantCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 2,
  },
  restaurantCardPaused: {
    borderColor: '#991b1b',
    backgroundColor: '#fff7f7',
  },
  restaurantCardBand: {
    height: 34,
    backgroundColor: colors.action,
  },
  restaurantCardBandPaused: {
    backgroundColor: '#991b1b',
  },
  restaurantImage: {
    height: 210,
    justifyContent: 'flex-end',
  },
  restaurantImageRadius: {
    resizeMode: 'cover',
  },
  imageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  imageScrimPaused: {
    backgroundColor: 'rgba(80,0,0,0.52)',
  },
  favoriteStar: {
    position: 'absolute',
    right: 22,
    top: 20,
    color: '#ff7474',
    fontSize: 36,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  closedPill: {
    backgroundColor: '#ff5959',
  },
  pausePill: {
    backgroundColor: '#7f1d1d',
    borderWidth: 2,
    borderColor: '#fecaca',
  },
  openPill: {
    backgroundColor: colors.success,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  restaurantInfo: {
    padding: 14,
    gap: 7,
  },
  restaurantContactButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3c4c4',
    backgroundColor: '#fff7f7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 4,
  },
  restaurantContactText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '900',
  },
  pauseNoticeCompact: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  pauseNoticeTitle: {
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '900',
  },
  pauseNoticeText: {
    color: '#7f1d1d',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  restaurantName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 3,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoIcon: {
    color: colors.red,
    fontSize: 16,
    width: 22,
  },
  infoText: {
    color: colors.muted,
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardAction: {
    color: colors.red,
    fontSize: 18,
    fontWeight: '900',
  },
  cardActionMuted: {
    color: '#7f1d1d',
  },
  menuContent: {
    paddingTop: Platform.OS === 'web' ? 0 : 44,
    paddingBottom: 150,
  },
  menuHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  overline: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  menuRestaurant: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  menuTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
  },
  menuSubtitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: '#eef0f2',
    borderWidth: 1,
    minHeight: 48,
    borderRadius: 999,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 18,
  },
  categoryRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  categoryChip: {
    minWidth: 92,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  categoryChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  categoryLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  categoryLabelActive: {
    color: '#fff',
  },
  warningBox: {
    marginHorizontal: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#facc15',
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 18,
  },
  pauseWarningBox: {
    borderColor: '#991b1b',
    backgroundColor: '#fef2f2',
    borderWidth: 2,
  },
  pauseWarningTitle: {
    color: '#991b1b',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  warningText: {
    color: '#9a3412',
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '800',
    textAlign: 'center',
  },
  pauseWarningText: {
    color: '#7f1d1d',
  },
  cancelOrderCard: {
    marginHorizontal: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    gap: 14,
  },
  cancelOrderTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  cancelOrderText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  cancelOrderButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  cancelOrderButtonText: {
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '900',
  },
  readyDirectionsCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  readyDirectionsButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  readyDirectionsButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  deleteAccountButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  deleteAccountButtonText: {
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '900',
  },
  accountModeTabs: {
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    padding: 4,
    gap: 4,
  },
  accountModeTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountModeTabActive: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
  },
  accountModeText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  accountModeTextActive: {
    color: colors.darkRed,
  },
  productGrid: {
    paddingHorizontal: 12,
    gap: 10,
  },
  productCard: {
    width: '100%',
    minHeight: 136,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    backgroundColor: colors.card,
    flexDirection: 'row',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  productCardUnavailable: {
    backgroundColor: '#f9fafb',
  },
  productImage: {
    width: 124,
    height: '100%',
    minHeight: 136,
  },
  productImageUnavailable: {
    opacity: 0.45,
  },
  productBody: {
    padding: 14,
    flex: 1,
    justifyContent: 'space-between',
  },
  productName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  productDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  prepText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  productTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  productTag: {
    color: colors.darkRed,
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '900',
  },
  productUnavailableBadge: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
  },
  allergenText: {
    color: '#846f62',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  productPrice: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  addCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledCircle: {
    backgroundColor: '#9ca3af',
  },
  addCircleText: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 29,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 32,
  },
  cartChoiceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.36)',
    justifyContent: 'flex-end',
    padding: 14,
    paddingBottom: 116,
  },
  cartChoiceCard: {
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    gap: 10,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  cartChoiceTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  cartChoiceText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '800',
  },
  cartChoiceMeta: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  cartChoiceActions: {
    gap: 10,
    marginTop: 4,
  },
  clientToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: Platform.OS === 'web' ? 18 : 52,
    zIndex: 50,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 10,
  },
  clientToastTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  clientToastText: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 3,
  },
  clientToastClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientToastCloseText: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '800',
  },
  productSheet: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '88%',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
    paddingBottom: 14,
  },
  productSheetAction: {
    marginHorizontal: 14,
    marginBottom: 6,
  },
  sheetImage: {
    height: 150,
    width: '100%',
  },
  sheetBody: {
    padding: 16,
    gap: 12,
  },
  sheetTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 33,
  },
  sheetDescription: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 25,
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: colors.warm,
  },
  iconButtonText: {
    fontSize: 26,
    color: colors.ink,
  },
  optionGroup: {
    gap: 10,
  },
  optionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  extraRow: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  extraName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  extraPrice: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 4,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  checkboxText: {
    color: '#fff',
    fontWeight: '900',
  },
  noteInput: {
    minHeight: 68,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  quantityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: 'hidden',
  },
  stepperButton: {
    width: 44,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warm,
  },
  stepperText: {
    color: colors.red,
    fontSize: 24,
    fontWeight: '900',
  },
  quantityText: {
    minWidth: 42,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#3b2b24',
    fontSize: 44,
    lineHeight: 44,
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#525252',
    fontSize: 17,
    marginTop: 3,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 18,
  },
  emptyIcon: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#eef1f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: {
    color: colors.red,
    fontSize: 52,
    fontWeight: '900',
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: '#374151',
    fontSize: 20,
    textAlign: 'center',
  },
  cartContent: {
    paddingBottom: 150,
    paddingTop: Platform.OS === 'web' ? 14 : 44,
  },
  cartItem: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
  },
  cartImage: {
    width: 82,
    height: 82,
    borderRadius: 8,
  },
  cartInfo: {
    flex: 1,
    gap: 5,
  },
  cartName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  cartMeta: {
    color: colors.muted,
    fontSize: 14,
  },
  stepperSmall: {
    width: 38,
    alignItems: 'center',
    gap: 6,
  },
  stepperSmallText: {
    color: colors.red,
    fontSize: 24,
    fontWeight: '900',
  },
  summaryCard: {
    margin: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 14,
  },
  loyaltyToggleRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.warm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 17,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f2efeb',
    borderColor: '#f2efeb',
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  priceLabel: {
    flex: 1,
    color: colors.muted,
    fontSize: 16,
  },
  priceValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  priceStrong: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
  },
  checkoutContent: {
    paddingBottom: 150,
    paddingTop: Platform.OS === 'web' ? 14 : 44,
  },
  formCard: {
    margin: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 14,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slotModeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  slotModeButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  slotModeButtonActive: {
    borderColor: colors.action,
    backgroundColor: colors.action,
  },
  slotModeText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  slotModeTextActive: {
    color: '#fff',
  },
  slotDayList: {
    gap: 10,
    paddingRight: 8,
  },
  slotDayButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  slotDayButtonActive: {
    borderColor: colors.action,
    backgroundColor: '#fff1f1',
  },
  slotDayText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  slotDayTextActive: {
    color: colors.action,
  },
  checkoutOptionRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.warm,
  },
  slotButton: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  slotButtonActive: {
    borderColor: colors.action,
    backgroundColor: colors.action,
  },
  slotButtonDisabled: {
    opacity: 0.45,
    backgroundColor: '#f3f4f6',
  },
  slotText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  slotTextActive: {
    color: '#fff',
  },
  slotTextDisabled: {
    color: '#9ca3af',
  },
  helperText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  formBanner: {
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  formBannerError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  formBannerSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  formBannerErrorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
  },
  formBannerSuccessText: {
    color: colors.success,
    fontSize: 14,
    lineHeight: 20,
  },
  ordersContent: {
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'web' ? 14 : 44,
    paddingBottom: 176,
    gap: 12,
  },
  ordersEmptyText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  pageTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
  },
  orderCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    gap: 8,
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  orderHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  orderId: {
    color: colors.red,
    fontSize: 15,
    fontWeight: '900',
  },
  orderDate: {
    color: '#525252',
    fontSize: 12,
    marginTop: 2,
  },
  orderBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#dcfce7',
    flexShrink: 0,
  },
  cancelBadge: {
    backgroundColor: '#fee2e2',
  },
  orderBadgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '900',
  },
  cancelBadgeText: {
    color: colors.red,
  },
  preorderBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    color: '#9a3412',
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  orderMeta: {
    color: '#525252',
    fontSize: 12,
    lineHeight: 17,
  },
  orderItems: {
    color: '#3b2b24',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  orderTotal: {
    color: colors.red,
    fontSize: 18,
    fontWeight: '900',
    flexShrink: 0,
  },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  orderInlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  orderActionButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    flexShrink: 1,
  },
  orderReviewedLabel: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
    alignSelf: 'center',
  },
  reviewModalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  reviewStar: {
    fontSize: 32,
    color: colors.line,
  },
  reviewStarActive: {
    color: colors.gold,
  },
  reviewCommentInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  reviewErrorText: {
    color: colors.red,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '700',
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#dedede',
    borderRadius: 8,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  actionButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  timelineCard: {
    margin: 20,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 18,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 14,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e5e7eb',
    marginTop: 2,
  },
  timelineDotActive: {
    backgroundColor: colors.red,
  },
  timelineTextWrap: {
    flex: 1,
  },
  timelineTitle: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: '900',
  },
  timelineTitleActive: {
    color: colors.ink,
  },
  timelineDescription: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 4,
  },
  profileContent: {
    paddingTop: Platform.OS === 'web' ? 0 : 44,
    paddingBottom: 150,
  },
  profileHero: {
    backgroundColor: colors.red,
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 56,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
  },
  profileName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    maxWidth: '90%',
  },
  profileEmail: {
    color: '#f3a0a0',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
    maxWidth: '90%',
  },
  loyaltyCard: {
    marginHorizontal: 14,
    marginTop: -34,
    borderRadius: 8,
    backgroundColor: colors.charcoal,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 5,
  },
  loyaltyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    flex: 1,
    minWidth: 0,
  },
  loyaltyPoints: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    minWidth: 36,
    textAlign: 'right',
  },
  progressBar: {
    height: 9,
    backgroundColor: '#6b6b6b',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e9bf7a',
  },
  loyaltyMuted: {
    color: '#c8c8c8',
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  rewardButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardButtonDisabled: {
    opacity: 0.55,
  },
  rewardButtonText: {
    color: '#8a5a10',
    fontSize: 14,
    fontWeight: '900',
  },
  darkDivider: {
    height: 1,
    backgroundColor: '#666',
  },
  profileLink: {
    marginHorizontal: 20,
    marginTop: 14,
    minHeight: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLinkText: {
    color: '#3b2b24',
    fontSize: 19,
    fontWeight: '900',
  },
  profileForgotPassword: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    marginTop: 4,
    paddingVertical: 4,
  },
  profileForgotPasswordText: {
    color: colors.action,
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  profileRestaurantChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  profileRestaurantChoice: {
    flexGrow: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#fff',
  },
  profileRestaurantChoiceActive: {
    borderColor: colors.red,
    backgroundColor: '#fff1f1',
  },
  profileRestaurantName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  profileRestaurantNameActive: {
    color: colors.red,
  },
  profileRestaurantMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },
  bottomNav: {
    position: Platform.OS === 'web' ? 'fixed' as 'absolute' : 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 58,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: colors.card,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  navIconSlot: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabelSlot: {
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    color: '#6b7280',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
    textAlign: 'center',
  },
  navActive: {
    color: colors.red,
  },
  navBadge: {
    position: 'absolute',
    top: 0,
    right: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  tabIconBox: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRoof: {
    position: 'absolute',
    top: 3,
    width: 15,
    height: 15,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  homeBody: {
    position: 'absolute',
    bottom: 3,
    width: 19,
    height: 16,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  homeDoor: {
    width: 6,
    height: 8,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  menuIconLine: {
    width: 21,
    height: 2,
    borderRadius: 2,
    marginVertical: 2,
  },
  bagHandle: {
    position: 'absolute',
    top: 3,
    width: 11,
    height: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    zIndex: 1,
  },
  bagBody: {
    position: 'absolute',
    bottom: 3,
    width: 21,
    height: 19,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
  },
  bagSmile: {
    width: 8,
    height: 5,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    marginTop: 5,
  },
  clockFace: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockHandVertical: {
    position: 'absolute',
    width: 2,
    height: 7,
    borderRadius: 2,
    top: 6,
  },
  clockHandHorizontal: {
    position: 'absolute',
    width: 7,
    height: 2,
    borderRadius: 2,
    left: 12,
    top: 12,
  },
  userHead: {
    width: 10,
    height: 10,
    borderWidth: 2,
    borderRadius: 6,
    marginBottom: 3,
  },
  userShoulders: {
    width: 21,
    height: 11,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  adminScreen: {
    flex: 1,
    backgroundColor: '#f4f5f7',
  },
  adminDesktopLayout: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
  },
  adminSidebar: {
    width: Platform.OS === 'web' ? 248 : 232,
    backgroundColor: '#2f2f2f',
    borderRightWidth: 1,
    borderRightColor: '#262626',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 4,
    zIndex: 5,
  },
  adminBrandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    marginBottom: 18,
  },
  adminBrandIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5b5b5b',
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBrandIconText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  adminBrandTexts: {
    flex: 1,
    minWidth: 0,
  },
  adminBrand: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
  },
  adminBrandSubtitle: {
    color: '#c7c7c7',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  adminSidebarNav: {
    gap: 6,
    flex: 1,
  },
  adminTab: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
    justifyContent: 'center',
  },
  adminTabActive: {
    backgroundColor: colors.darkRed,
    shadowColor: colors.darkRed,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  adminTabText: {
    color: '#cfcfcf',
    fontSize: 15,
    fontWeight: '900',
  },
  adminTabTextActive: {
    color: '#fff',
  },
  adminSidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: '#474747',
    paddingTop: 16,
    gap: 10,
  },
  adminAccountLabel: {
    color: '#a6a6a6',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  adminAccountText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '800',
  },
  adminLogoutButton: {
    borderWidth: 1,
    borderColor: '#696969',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#3d3d3d',
    alignSelf: 'flex-start',
  },
  adminLogoutText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  adminLoginScreen: {
    flex: 1,
    backgroundColor: colors.warm,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  adminLoginCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    padding: 24,
    gap: 16,
  },
  adminLoginTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
  },
  adminLoginText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  adminMain: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#f4f5f7',
  },
  adminHeaderBar: {
    minHeight: 70,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: Platform.OS === 'web' ? 30 : 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  adminHeaderStatus: {
    borderWidth: 1,
    borderColor: '#d1fadf',
    backgroundColor: '#ecfdf3',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  adminHeaderStatusDot: {
    color: colors.success,
    fontSize: 10,
    lineHeight: 13,
  },
  adminHeaderStatusText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '900',
  },
  adminBody: {
    flex: 1,
  },
  adminBodyContent: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1920 : undefined,
    alignSelf: 'flex-start',
    paddingHorizontal: Platform.OS === 'web' ? 30 : 16,
    paddingTop: 20,
    paddingBottom: 42,
    gap: 18,
  },
  adminPageHero: {
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ec',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
  adminPageHeroText: {
    flex: 1,
    minWidth: 260,
  },
  adminEyebrow: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  adminPageTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 4,
  },
  adminPageDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  adminHeroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  adminHeroStat: {
    minWidth: 126,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#eaecf0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  adminHeroStatValue: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '900',
  },
  adminHeroStatLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  adminFormCard: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 8,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#fff',
    gap: 14,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 2,
  },
  adminFormCardNested: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#f9fafb',
    gap: 12,
  },
  adminFormTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
  },
  pushDiagnosticHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pushDiagnosticGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  adminAddExtraButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: colors.darkRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    alignSelf: 'flex-end',
  },
  adminAddExtraText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  adminExtrasList: {
    gap: 8,
  },
  adminRestaurantAssignGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  restaurantAssignPill: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  restaurantAssignPillActive: {
    borderColor: colors.darkRed,
    backgroundColor: '#fff1f1',
  },
  restaurantAssignText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  restaurantAssignTextActive: {
    color: colors.darkRed,
  },
  adminExtraRow: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adminQuickPanel: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 8,
    padding: 16,
    marginBottom: 18,
    backgroundColor: '#fff',
    gap: 12,
  },
  quickStockRow: {
    gap: 10,
  },
  quickStockPill: {
    minWidth: 180,
    borderWidth: 1,
    borderColor: '#d1fadf',
    backgroundColor: '#ecfdf3',
    borderRadius: 8,
    padding: 12,
  },
  quickStockPillOff: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  quickStockText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '900',
  },
  quickStockTextOff: {
    color: colors.red,
  },
  quickStockMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  adminSuccessMessage: {
    color: colors.success,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 14,
  },
  adminImagePreview: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adminImageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  adminSelectedImageNotice: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    padding: 12,
    gap: 4,
  },
  adminImagePreviewImage: {
    width: 92,
    height: 62,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  adminFormRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scheduleGrid: {
    gap: 8,
  },
  scheduleRow: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  scheduleRowClosed: {
    backgroundColor: '#f9fafb',
  },
  scheduleDayLabel: {
    width: Platform.OS === 'web' ? 92 : 76,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  scheduleClosedToggle: {
    minWidth: 74,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  scheduleClosedToggleActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  scheduleClosedText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '900',
  },
  scheduleClosedTextActive: {
    color: colors.red,
  },
  scheduleTimeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleInput: {
    width: 82,
    minHeight: 40,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 10,
  },
  scheduleSeparator: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '900',
  },
  adminTextArea: {
    minHeight: 86,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  adminTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 14,
  },
  adminTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  adminActionButton: {
    backgroundColor: colors.darkRed,
    borderRadius: 8,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  adminActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  adminFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ec',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  filterPillActive: {
    backgroundColor: '#fff5f5',
    borderColor: '#efb0b2',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  filterText: {
    color: '#7a716a',
    fontSize: 15,
    fontWeight: '900',
  },
  filterTextActive: {
    color: colors.ink,
  },
  plannedOrdersNotice: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  plannedOrdersNoticeCopy: {
    flex: 1,
    gap: 2,
  },
  plannedOrdersNoticeTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  plannedOrdersNoticeText: {
    color: '#7a716a',
    fontSize: 13,
    fontWeight: '700',
  },
  plannedOrdersNoticeButton: {
    backgroundColor: colors.darkRed,
    borderRadius: 8,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  plannedOrdersNoticeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  adminEmpty: {
    textAlign: 'center',
    color: '#7a716a',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 90,
  },
  adminEmptySmall: {
    color: '#7a716a',
    fontSize: 16,
    fontWeight: '900',
    padding: 18,
  },
  kitchenFullscreen: {
    flex: 1,
    backgroundColor: '#111827',
  },
  kitchenFullscreenHeader: {
    minHeight: 76,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kitchenFullscreenTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  kitchenFullscreenGrid: {
    padding: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  kitchenFullscreenCard: {
    width: Platform.OS === 'web' ? 440 : '100%',
    borderRadius: 8,
    backgroundColor: '#fff',
    padding: 20,
    gap: 14,
  },
  kitchenFullscreenStatus: {
    color: colors.red,
    fontSize: 22,
    fontWeight: '900',
  },
  adminOrderDetail: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '90%',
    borderRadius: 8,
    backgroundColor: '#fff',
    padding: 22,
    gap: 14,
  },
  adminStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  adminOrderItem: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#edf0f3',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  adminOrderCustomer: {
    borderWidth: 1,
    borderColor: '#edf0f3',
    borderRadius: 8,
    padding: 12,
    gap: 5,
  },
  adminGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'stretch',
  },
  kitchenCard: {
    width: Platform.OS === 'web' ? 420 : '100%',
    maxWidth: Platform.OS === 'web' ? 520 : undefined,
    flexGrow: Platform.OS === 'web' ? 1 : 0,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 8,
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  kitchenCardSoon: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  kitchenCardLate: {
    borderColor: '#dc2626',
    backgroundColor: '#fff1f2',
    borderWidth: 2,
  },
  kitchenDateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  kitchenDateBadgeFuture: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  kitchenDateText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  kitchenUrgencyBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  kitchenUrgencyBadgeLate: {
    backgroundColor: '#dc2626',
  },
  kitchenUrgencyText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  kitchenNoteBox: {
    borderWidth: 2,
    borderColor: colors.red,
    borderRadius: 8,
    backgroundColor: '#fff1f2',
    padding: 12,
    gap: 6,
  },
  kitchenNoteTitle: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  kitchenNoteText: {
    color: '#3b0a0a',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  prepControlRow: {
    borderWidth: 1,
    borderColor: '#edf0f3',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tableCard: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 2,
  },
  tableCardWide: {
    minWidth: Platform.OS === 'web' ? 1040 : 900,
    width: '100%',
  },
  adminTableScrollContent: {
    width: '100%',
  },
  tableHeaderRow: {
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e7ec',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  tableHeaderText: {
    color: '#6b625c',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tableHeaderActions: {
    minWidth: 168,
    color: '#6b625c',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  tableHeaderSwitch: {
    minWidth: 92,
    color: '#6b625c',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tableRow: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  tableProduct: {
    flex: 2.4,
    minWidth: 300,
  },
  tableNameCell: {
    width: 190,
  },
  tablePrimary: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  tableSub: {
    color: '#837165',
    fontSize: 13,
    marginTop: 5,
  },
  tableCell: {
    flex: 1,
    color: '#837165',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 150,
  },
  tableCellBlock: {
    flex: 1,
    minWidth: 150,
    justifyContent: 'center',
  },
  tablePrice: {
    minWidth: 96,
    color: '#8a5a10',
    fontSize: 14,
    fontWeight: '900',
  },
  tableActions: {
    minWidth: 90,
    color: colors.coral,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  adminInlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
    minWidth: 168,
  },
  adminTinyButton: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: colors.darkRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  adminDangerButton: {
    backgroundColor: colors.coral,
  },
  adminTinyButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  adminMutedActionText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '900',
  },
  adminStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  adminStatusBadgeNew: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  adminStatusBadgeReady: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  adminStatusBadgeDone: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  adminStatusBadgeCancelled: {
    borderColor: '#fecaca',
    backgroundColor: '#fee2e2',
  },
  adminStatusBadgeText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  adminStatusBadgeTextDanger: {
    color: '#991b1b',
  },
  adminStatusBadgeTextMuted: {
    color: '#6b7280',
  },
  actionIconText: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  deleteIconText: {
    color: colors.coral,
    fontSize: 20,
    fontWeight: '900',
  },
  adminCategoryFilters: {
    gap: 10,
    marginBottom: 18,
  },
  categoryFilter: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  categoryFilterActive: {
    backgroundColor: colors.darkRed,
    borderColor: colors.darkRed,
  },
  categoryFilterText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  categoryFilterTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statCard: {
    width: Platform.OS === 'web' ? 230 : '47%',
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 8,
    padding: 18,
    backgroundColor: '#fff',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 2,
  },
  statLabel: {
    color: '#837165',
    fontSize: 15,
    fontWeight: '800',
  },
  statValue: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '900',
    marginTop: 12,
  },
  adminListCard: {
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: '#fff',
    marginBottom: 12,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  restaurantSettingsGrid: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 18,
    alignItems: 'flex-start',
  },
  restaurantSettingsItem: {
    minHeight: 68,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    backgroundColor: '#fff',
  },
  restaurantSettingsItemActive: {
    borderColor: '#efb0b2',
    backgroundColor: '#fff5f5',
  },
  adminThumb: {
    width: 76,
    height: 76,
    borderRadius: 8,
  },
  percentCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentText: {
    color: '#2563eb',
    fontSize: 24,
    fontWeight: '900',
  },
  activeLabel: {
    backgroundColor: '#dcfce7',
    color: colors.success,
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: '900',
  },
  inactiveLabel: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  adminSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1d5db',
    padding: 3,
    justifyContent: 'center',
  },
  adminSwitchActive: {
    backgroundColor: '#111111',
  },
  adminSwitchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  adminSwitchKnobActive: {
    transform: [{ translateX: 20 }],
  },
}));
