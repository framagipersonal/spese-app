import { Injectable, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

export interface Category {
  id: number;
  name: string;
}

export interface Expense {
  id: number;
  amount: number;
  spent_on: string; // 'YYYY-MM-DD'
  note: string | null;
  receipt_path: string | null;
  category_id: number | null;
  categories: { name: string } | null; // join automatico tramite la foreign key
}

export interface NewExpense {
  amount: number;
  spent_on: string;
  category_id: number | null;
  note: string | null;
}

export interface MonthlyTotal {
  month: string;
  category: string;
  total: number;
  items: number;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly sb: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey);
  private readonly ready: Promise<void>;

  /** Sessione corrente (null = non loggato) */
  readonly session = signal<Session | null>(null);

  constructor() {
    // getSession() legge anche il token arrivato dal magic link nell'URL
    this.ready = this.sb.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.sb.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  // ---------- Auth ----------
  async isLoggedIn(): Promise<boolean> {
    await this.ready;
    return this.session() !== null;
  }

  signIn(email: string) {
    return this.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  }

  signOut() {
    return this.sb.auth.signOut();
  }

  // ---------- Lettura ----------
  async categories(): Promise<Category[]> {
    const { data, error } = await this.sb.from('categories').select('id, name').order('name');
    if (error) throw error;
    return data;
  }

  /** month = 'YYYY-MM' */
  async expenses(month: string): Promise<Expense[]> {
    const { from, to } = monthRange(month);
    const { data, error } = await this.sb
      .from('expenses')
      .select('id, amount, spent_on, note, receipt_path, category_id, categories(name)')
      .gte('spent_on', from)
      .lt('spent_on', to)
      .order('spent_on', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return data as unknown as Expense[];
  }

  async monthlyTotals(month: string): Promise<MonthlyTotal[]> {
    const { data, error } = await this.sb
      .from('monthly_totals')
      .select('month, category, total, items')
      .eq('month', `${month}-01`)
      .order('total', { ascending: false });
    if (error) throw error;
    return data;
  }

  // ---------- Scrittura ----------
  async addExpense(input: NewExpense, receipt: File | null): Promise<void> {
    let receipt_path: string | null = null;

    if (receipt) {
      const userId = this.session()?.user.id;
      const safeName = receipt.name.replace(/[^\w.-]/g, '_');
      // la prima cartella DEVE essere lo user id: lo richiedono le policy dello Storage
      const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await this.sb.storage.from('receipts').upload(path, receipt);
      if (error) throw error;
      receipt_path = path;
    }

    // user_id non serve: lo valorizza il default auth.uid() nel database
    const { error } = await this.sb.from('expenses').insert({ ...input, receipt_path });
    if (error) throw error;
  }

  async deleteExpense(expense: Expense): Promise<void> {
    if (expense.receipt_path) {
      await this.sb.storage.from('receipts').remove([expense.receipt_path]);
    }
    const { error } = await this.sb.from('expenses').delete().eq('id', expense.id);
    if (error) throw error;
  }

  /** Il bucket è privato: si genera un link temporaneo (60 secondi) */
  async receiptUrl(path: string): Promise<string> {
    const { data, error } = await this.sb.storage.from('receipts').createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  }
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // primo giorno del mese dopo
  return { from, to };
}
