#!/bin/bash

# Script para limpiar NovaPOS - localhost, IndexedDB, localStorage y operaciones pendientes

echo "🧹 Limpiando NovaPOS..."
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Matar procesos de Node.js
echo -e "${BLUE}1. Deteniendo servidores...${NC}"
pkill -f "node.*backend" 2>/dev/null && echo -e "${GREEN}✓ Backend detenido${NC}" || echo "  Backend no estaba corriendo"
pkill -f "vite" 2>/dev/null && echo -e "${GREEN}✓ Frontend detenido${NC}" || echo "  Frontend no estaba corriendo"
sleep 1

# 2. Limpiar puertos
echo ""
echo -e "${BLUE}2. Liberando puertos...${NC}"
lsof -i :3000 2>/dev/null | grep -v COMMAND | awk '{print $2}' | xargs -r kill -9 2>/dev/null && echo -e "${GREEN}✓ Puerto 3000 liberado${NC}" || true
lsof -i :3001 2>/dev/null | grep -v COMMAND | awk '{print $2}' | xargs -r kill -9 2>/dev/null && echo -e "${GREEN}✓ Puerto 3001 liberado${NC}" || true
lsof -i :5173 2>/dev/null | grep -v COMMAND | awk '{print $2}' | xargs -r kill -9 2>/dev/null && echo -e "${GREEN}✓ Puerto 5173 liberado${NC}" || true

# 3. Limpiar caché del navegador (instrucciones)
echo ""
echo -e "${YELLOW}3. LIMPIEZA DEL NAVEGADOR (Manual)${NC}"
echo -e "   Abre el navegador y ejecuta en la consola (F12 → Console):"
echo ""
echo -e "${BLUE}   // Limpiar IndexedDB (offline queue):${NC}"
echo "   indexedDB.databases().then(dbs => {"
echo "     dbs.forEach(db => indexedDB.deleteDatabase(db.name))"
echo "   })"
echo ""
echo -e "${BLUE}   // Limpiar localStorage:${NC}"
echo "   localStorage.clear()"
echo ""
echo -e "${BLUE}   // Limpiar sessionStorage:${NC}"
echo "   sessionStorage.clear()"
echo ""
echo -e "${BLUE}   // Limpiar cookies:${NC}"
echo "   document.cookie.split(';').forEach(c => {"
echo "     document.cookie = c.split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;'"
echo "   })"
echo ""

# 4. Mostrar qué se limpió
echo -e "${GREEN}✓ Limpieza completada${NC}"
echo ""
echo -e "${YELLOW}Próximos pasos:${NC}"
echo "1. Abre http://localhost:5173 en el navegador"
echo "2. Abre la consola (F12)"
echo "3. Copia y ejecuta los comandos anteriores"
echo "4. Recarga la página (Ctrl+R o Cmd+R)"
echo "5. Inicia sesión nuevamente"
echo ""
echo -e "${BLUE}Para reiniciar los servidores:${NC}"
echo "  npm run dev"
echo ""
