'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { addSupplier } from '@/app/actions/suppliers';

interface SupplierFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function SupplierForm({ onSuccess, onCancel }: SupplierFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Supplier name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await addSupplier(formData);

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(`Supplier "${formData.name}" added successfully`);
      
      setFormData({
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
      });

      onSuccess?.();
    } catch (error: any) {
      console.error('Error adding supplier:', error);
      toast.error(error.message || 'Failed to add supplier');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Supplier Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., ABC Flour Mills Ltd"
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="contact_name" className="text-sm font-medium">
            Contact Person
          </Label>
          <Input
            id="contact_name"
            name="contact_name"
            value={formData.contact_name}
            onChange={handleChange}
            placeholder="e.g., John Smith"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="phone" className="text-sm font-medium">
            Phone
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="e.g., 09-123-4567"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="email" className="text-sm font-medium">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="e.g., orders@supplier.co.nz"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="address" className="text-sm font-medium">
            Address
          </Label>
          <Input
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="e.g., 123 Main St, Auckland"
            className="mt-1"
          />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="notes" className="text-sm font-medium">
            Notes
          </Label>
          <Textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Delivery days, payment terms, special instructions..."
            rows={3}
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4 border-t">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding...' : 'Add Supplier'}
        </Button>
      </div>
    </form>
  );
}