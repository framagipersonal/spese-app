import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { LoginComponent } from './auth/login.component';
import { ExpensesComponent } from './expenses/expenses.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: ExpensesComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
