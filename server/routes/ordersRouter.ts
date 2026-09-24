/**
 * GHarvest Orders & Escrow Router
 */

import { Router, Request, Response } from 'express';
import { EscrowService } from '../services/escrowService';

export const ordersRouter = Router();

// Get all orders
ordersRouter.get('/orders', (_req: Request, res: Response) => {
  const orders = EscrowService.getOrders();
  res.json(orders);
});

// Create new escrow order
ordersRouter.post('/orders', (req: Request, res: Response) => {
  try {
    const order = EscrowService.createOrder(req.body);
    res.status(201).json(order);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to create order', details: err.message });
  }
});

// Update order status (transit, delivery, escrow release, dispute)
ordersRouter.patch('/orders/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, escrowStatus, note } = req.body;

  const updated = EscrowService.updateStatus(id, status, escrowStatus, note);
  if (!updated) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  res.json(updated);
});
