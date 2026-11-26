import { OrderPaymentStatus, OrderStatus } from '@shopivo/shared-models';
import { BadgeTone } from '@shopivo/shared-ui';

export const ORDER_TONE: Record<OrderStatus, BadgeTone> = {
  NEW: 'violet', PROCESSING: 'info', SHIPPED: 'brand', COMPLETED: 'success', CANCELED: 'neutral',
};

export const PAYMENT_TONE: Record<OrderPaymentStatus, BadgeTone> = { UNPAID: 'warning', PAID: 'success', REFUNDED: 'neutral' };
