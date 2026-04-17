'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ProductFormProps {
  product?: {
    id: string;
    name: string;
    price: number;
    description?: string;
    category?: string;
    image_url?: string;
    code?: string;
    gst_applicable?: boolean;
    production_type?: string;
    pieces_per_tray?: number;
    dough_weight_grams?: number;
  };
  isEditing?: boolean;
}

const PRODUCTION_TYPES = [
  { value: '', label: 'Not applicable' },
  { value: 'roll', label: 'Roll (tray-based)' },
  { value: 'bread', label: 'Bread (per loaf)' },
]

const DOUGH_TYPES = ['White', 'Wholemeal', 'Grain']

export default function ProductForm({ product, isEditing = false }: ProductFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [formData, setFormData] = useState({
    name: product?.name || '',
    price: product?.price?.toString() || '',
    description: product?.description || '',
    category: product?.category || '',
    image_url: product?.image_url || '',
    code: product?.code || '',
    gst_applicable: product?.gst_applicable ?? false,
    production_type: product?.production_type || '',
    pieces_per_tray: product?.pieces_per_tray?.toString() || '',
    dough_weight_grams: product?.dough_weight_grams?.toString() || '',
  });
  const [doughType, setDoughType] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(product?.image_url || '');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load dough_type from recipe if editing
  useEffect(() => {
    if (!isEditing || !product?.id) return;
    supabase
      .from('recipes')
      .select('dough_type')
      .eq('product_id', product.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.dough_type) setDoughType(data.dough_type);
      });
  }, [product?.id, isEditing]);

  const isProductionProduct = formData.production_type === 'roll' || formData.production_type === 'bread';
  const isRoll = formData.production_type === 'roll';

  // Auto-detect production type from code
  const codeNum = parseInt(formData.code) || 0;
  const suggestedType =
    codeNum >= 2000 && codeNum <= 2750 ? 'bread' :
    codeNum >= 2751 && codeNum <= 3750 ? 'roll' : '';

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be less than 5MB'); return; }
    setImageFile(file);
    setError('');
    const reader = new FileReader();
    reader.onloadend = () => { setImagePreview(reader.result as string); };
    reader.readAsDataURL(file);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return formData.image_url || null;
    setUploading(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const formDataUpload = new FormData();
      formDataUpload.append('file', imageFile);
      formDataUpload.append('fileName', fileName);
      const response = await fetch('/api/upload-image', { method: 'POST', body: formDataUpload });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data.imageUrl;
    } catch (err: any) {
      setError(`Image upload failed: ${err.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let imageUrl = formData.image_url;
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (!uploadedUrl) throw new Error('Image upload failed');
        imageUrl = uploadedUrl;
      }

      const url = isEditing ? `/api/products/${product?.id}` : '/api/products';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          price: parseFloat(formData.price),
          description: formData.description || null,
          category: formData.category || null,
          image_url: imageUrl || null,
          code: formData.code || null,
          gst_applicable: formData.gst_applicable,
          production_type: formData.production_type || null,
          pieces_per_tray: formData.pieces_per_tray ? parseInt(formData.pieces_per_tray) : null,
          dough_weight_grams: formData.dough_weight_grams ? parseFloat(formData.dough_weight_grams) : null,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Save dough_type to recipe if set
      if (isEditing && product?.id && doughType && isProductionProduct) {
        const { data: recipe } = await supabase
          .from('recipes')
          .select('id')
          .eq('product_id', product.id)
          .maybeSingle();

        if (recipe) {
          await supabase
            .from('recipes')
            .update({ dough_type: doughType })
            .eq('id', recipe.id);
        }
      }

      router.push('/admin/products');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    setFormData({ ...formData, image_url: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700 font-semibold">Error</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Product Code */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Product Code <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          className="w-full px-3 py-2 border-2 border-green-500 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-lg"
          placeholder="e.g. 2001"
          required
        />
        <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">Code Range Guide:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold text-pink-700">1000-1999</span>
              <span className="text-gray-600">Cakes</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold text-amber-700">2000-2750</span>
              <span className="text-gray-600">Bread</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold text-orange-700">2751-3750</span>
              <span className="text-gray-600">Rolls</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold text-yellow-700">3751-4000</span>
              <span className="text-gray-600">Pies</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold text-purple-700">4001+</span>
              <span className="text-gray-600">Other</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold text-blue-700">900</span>
              <span className="text-gray-600">Admin</span>
            </div>
          </div>
        </div>

        {formData.code === '900' && (
          <div className="mt-2 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-md">
            <p className="text-sm font-semibold text-blue-900 mb-1">Administrative Product (Code 900)</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Allows custom descriptions and custom prices on orders.
            </p>
          </div>
        )}
      </div>

      {/* Product Name */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Product Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="Sourdough Bread"
          required
        />
      </div>

      {/* Price */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Price <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-500 font-semibold">$</span>
          <input
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            className="w-full pl-8 pr-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
            placeholder="5.50"
            required
          />
        </div>
      </div>

      {/* GST Applicable */}
      <div>
        <label className="block text-sm font-medium mb-2">GST Applicable</label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gst_applicable"
              checked={formData.gst_applicable === true}
              onChange={() => setFormData({ ...formData, gst_applicable: true })}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm">Yes (GST applies)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gst_applicable"
              checked={formData.gst_applicable === false}
              onChange={() => setFormData({ ...formData, gst_applicable: false })}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm">No (GST-free)</span>
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Most bakery products are GST-free. Select Yes for non-food items.
        </p>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium mb-2">Category</label>
        <input
          type="text"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="Bread, Pastries, Cakes etc."
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          PRODUCTION SETTINGS — NEW SECTION
         ══════════════════════════════════════════════════════════════ */}
      <div className="border-t-2 border-green-200 pt-6">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2" style={{ color: '#006A4E' }}>
          🧮 Production Settings
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Used by the Dough Calculator on the Production page. Only needed for bread &amp; roll products.
        </p>

        {/* Production Type */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Production Type</label>
          <div className="flex flex-wrap gap-3">
            {PRODUCTION_TYPES.map(opt => (
              <label
                key={opt.value}
                className={[
                  'flex items-center gap-2 px-4 py-2 rounded-md border cursor-pointer transition-colors text-sm',
                  formData.production_type === opt.value
                    ? opt.value === 'roll'
                      ? 'bg-orange-50 border-orange-400 text-orange-800 font-semibold'
                      : opt.value === 'bread'
                        ? 'bg-amber-50 border-amber-400 text-amber-800 font-semibold'
                        : 'bg-gray-100 border-gray-400 text-gray-700 font-semibold'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="production_type"
                  value={opt.value}
                  checked={formData.production_type === opt.value}
                  onChange={() => setFormData({ ...formData, production_type: opt.value })}
                  className="sr-only"
                />
                {opt.value === 'roll' && '🥖 '}
                {opt.value === 'bread' && '🍞 '}
                {opt.label}
              </label>
            ))}
          </div>
          {suggestedType && formData.production_type !== suggestedType && !formData.production_type && (
            <p className="text-xs text-blue-600 mt-2">
              💡 Code {formData.code} is in the {suggestedType} range — did you mean to set this as a {suggestedType}?
            </p>
          )}
        </div>

        {/* Production fields — only show when type is set */}
        {isProductionProduct && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">

            {/* Dough Weight */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Dough Weight per {isRoll ? 'Piece' : 'Loaf'} (grams) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.dough_weight_grams}
                onChange={e => setFormData({ ...formData, dough_weight_grams: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 font-mono"
                placeholder={isRoll ? 'e.g. 45' : 'e.g. 520'}
              />
              <p className="text-xs text-gray-400 mt-1">
                {isRoll ? 'Grams of dough per roll/bun' : 'Grams of dough per loaf'}
              </p>
            </div>

            {/* Pieces per Tray — rolls only */}
            {isRoll && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Pieces per Tray <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.pieces_per_tray}
                  onChange={e => setFormData({ ...formData, pieces_per_tray: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 font-mono"
                  placeholder="e.g. 15"
                />
                <p className="text-xs text-gray-400 mt-1">
                  How many rolls fit on one tray (rounds up to full trays)
                </p>
              </div>
            )}

            {/* Dough Type — from recipe */}
            <div className={isRoll ? '' : 'md:col-span-1'}>
              <label className="block text-sm font-medium mb-1">
                Dough Type <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={doughType}
                  onChange={e => setDoughType(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">Select dough type...</option>
                  {DOUGH_TYPES.map(dt => (
                    <option key={dt} value={dt}>{dt}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={doughType}
                  onChange={e => setDoughType(e.target.value)}
                  placeholder="Or type custom..."
                  className="w-40 px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Saved to recipe — groups products by dough type in calculator
              </p>
            </div>

            {/* Preview calculation */}
            {formData.dough_weight_grams && (
              <div className="md:col-span-2 p-3 bg-green-50 border border-green-200 rounded-md text-sm">
                <span className="font-semibold text-green-800">Preview: </span>
                {isRoll && formData.pieces_per_tray ? (
                  <span className="text-green-700">
                    100 ordered → {Math.ceil(100 / parseInt(formData.pieces_per_tray))} trays
                    ({Math.ceil(100 / parseInt(formData.pieces_per_tray)) * parseInt(formData.pieces_per_tray)} pieces)
                    → {((Math.ceil(100 / parseInt(formData.pieces_per_tray)) * parseInt(formData.pieces_per_tray) * parseFloat(formData.dough_weight_grams)) / 1000).toFixed(1)} kg dough
                  </span>
                ) : !isRoll ? (
                  <span className="text-green-700">
                    25 loaves → {((25 * parseFloat(formData.dough_weight_grams)) / 1000).toFixed(1)} kg dough
                  </span>
                ) : (
                  <span className="text-gray-400">Enter pieces per tray to see preview</span>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          rows={3}
          placeholder="Product description..."
        />
      </div>

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium mb-2">Product Image</label>
        {imagePreview ? (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Product preview"
              className="w-full max-w-sm h-64 object-cover rounded-lg border-2 border-gray-300"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-500 transition-colors">
            <ImageIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
            <label className="cursor-pointer">
              <span className="text-green-600 hover:text-green-700 font-semibold">Click to upload</span>
              <span className="text-gray-500"> or drag and drop</span>
              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </label>
            <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF up to 5MB</p>
          </div>
        )}
        <div className="mt-3">
          <p className="text-xs text-gray-600 mb-2">Or paste an image URL:</p>
          <input
            type="url"
            value={formData.image_url}
            onChange={(e) => {
              setFormData({ ...formData, image_url: e.target.value });
              setImagePreview(e.target.value);
            }}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4 border-t">
        <button
          type="submit"
          disabled={loading || uploading}
          className="flex-1 px-6 py-3 rounded-md text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ backgroundColor: '#006A4E' }}
        >
          {uploading ? 'Uploading image...' : loading ? 'Saving...' : isEditing ? 'Update Product' : 'Create Product'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading || uploading}
          className="px-6 py-3 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}