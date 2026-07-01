/**
 * Catálogo de provincias, cantones y distritos de Costa Rica con sus códigos oficiales
 * (los que exige Hacienda). Provincia = 1 dígito, Cantón = 2 dígitos, Distrito = 2 dígitos.
 */
export interface CRDistrict { code: string; name: string; }
export interface CRCanton { code: string; name: string; districts: CRDistrict[]; }
export interface CRProvince { code: string; name: string; cantons: CRCanton[]; }

const D = (code: string, name: string): CRDistrict => ({ code, name });
const C = (code: string, name: string, districts: CRDistrict[]): CRCanton => ({ code, name, districts });

export const CR_PROVINCES: CRProvince[] = [
  { code: '1', name: 'San José', cantons: [
    C('01','San José', [D('01','Carmen'), D('02','Merced'), D('03','Hospital'), D('04','Catedral'), D('05','Zapote'), D('06','San Francisco de Dos Ríos'), D('07','Uruca'), D('08','Mata Redonda'), D('09','Pavas'), D('10','Hatillo'), D('11','San Sebastián')]),
    C('02','Escazú', [D('01','Escazú'), D('02','San Antonio'), D('03','San Rafael')]),
    C('03','Desamparados', [D('01','Desamparados'), D('02','San Miguel'), D('03','San Juan de Dios'), D('04','San Rafael Arriba'), D('05','San Antonio'), D('06','Frailes'), D('07','Patarrá'), D('08','San Cristóbal'), D('09','Rosario'), D('10','Damas'), D('11','San Rafael Abajo'), D('12','Gravilias'), D('13','Los Guido')]),
    C('04','Puriscal', [D('01','Santiago'), D('02','Mercedes Sur'), D('03','Barbacoas'), D('04','Grifo Alto'), D('05','San Rafael'), D('06','Candelarita'), D('07','Desamparaditos'), D('08','San Antonio'), D('09','Chires')]),
    C('05','Tarrazú', [D('01','San Marcos'), D('02','San Lorenzo'), D('03','San Carlos')]),
    C('06','Aserrí', [D('01','Aserrí'), D('02','Tarbaca'), D('03','Vuelta de Jorco'), D('04','San Gabriel'), D('05','Legua'), D('06','Monterrey'), D('07','Salitrillos')]),
    C('07','Mora', [D('01','Colón'), D('02','Guayabo'), D('03','Tabarcia'), D('04','Piedras Negras'), D('05','Picagres'), D('06','Jaris'), D('07','Quitirrisí')]),
    C('08','Goicoechea', [D('01','Guadalupe'), D('02','San Francisco'), D('03','Calle Blancos'), D('04','Mata de Plátano'), D('05','Ipís'), D('06','Rancho Redondo'), D('07','Purral')]),
    C('09','Santa Ana', [D('01','Santa Ana'), D('02','Salitral'), D('03','Pozos'), D('04','Uruca'), D('05','Piedades'), D('06','Brasil')]),
    C('10','Alajuelita', [D('01','Alajuelita'), D('02','San Josecito'), D('03','San Antonio'), D('04','Concepción'), D('05','San Felipe')]),
    C('11','Vázquez de Coronado', [D('01','San Isidro'), D('02','San Rafael'), D('03','Dulce Nombre de Jesús'), D('04','Patalillo'), D('05','Cascajal')]),
    C('12','Acosta', [D('01','San Ignacio'), D('02','Guaitil'), D('03','Palmichal'), D('04','Cangrejal'), D('05','Sabanillas')]),
    C('13','Tibás', [D('01','San Juan'), D('02','Cinco Esquinas'), D('03','Anselmo Llorente'), D('04','Leon XIII'), D('05','Colima')]),
    C('14','Moravia', [D('01','San Vicente'), D('02','San Jerónimo'), D('03','Trinidad')]),
    C('15','Montes de Oca', [D('01','San Pedro'), D('02','Sabanilla'), D('03','Mercedes'), D('04','San Rafael')]),
    C('16','Turrubares', [D('01','San Pablo'), D('02','San Pedro'), D('03','San Juan de Mata'), D('04','San Luis'), D('05','Carara')]),
    C('17','Dota', [D('01','Santa María'), D('02','Jardín'), D('03','Copey')]),
    C('18','Curridabat', [D('01','Curridabat'), D('02','Granadilla'), D('03','Sánchez'), D('04','Tirrases')]),
    C('19','Pérez Zeledón', [D('01','San Isidro de El General'), D('02','General'), D('03','Daniel Flores'), D('04','Rivas'), D('05','San Pedro'), D('06','Platanares'), D('07','Pejibaye'), D('08','Cajón'), D('09','Barú'), D('10','Río Nuevo'), D('11','Páramo'), D('12','La Amistad')]),
    C('20','León Cortés Castro', [D('01','San Pablo'), D('02','San Andrés'), D('03','Llano Bonito'), D('04','San Isidro'), D('05','Santa Cruz'), D('06','San Antonio')]),
  ]},
  { code: '2', name: 'Alajuela', cantons: [
    C('01','Alajuela', [D('01','Alajuela'), D('02','San José'), D('03','Carrizal'), D('04','San Antonio'), D('05','Guácima'), D('06','San Isidro'), D('07','Sabanilla'), D('08','San Rafael'), D('09','Río Segundo'), D('10','Desamparados'), D('11','Turrúcares'), D('12','Tambor'), D('13','Garita'), D('14','Sarapiquí')]),
    C('02','San Ramón', [D('01','San Ramón'), D('02','Santiago'), D('03','San Juan'), D('04','Piedades Norte'), D('05','Piedades Sur'), D('06','San Rafael'), D('07','San Isidro'), D('08','Ángeles'), D('09','Alfaro'), D('10','Volio'), D('11','Concepción'), D('12','Zapotal'), D('13','Peñas Blancas'), D('14','San Lorenzo')]),
    C('03','Grecia', [D('01','Grecia'), D('02','San Isidro'), D('03','San José'), D('04','San Roque'), D('05','Tacares'), D('06','Puente de Piedra'), D('07','Bolívar')]),
    C('04','San Mateo', [D('01','San Mateo'), D('02','Desmonte'), D('03','Jesús María'), D('04','Labrador')]),
    C('05','Atenas', [D('01','Atenas'), D('02','Jesús'), D('03','Mercedes'), D('04','San Isidro'), D('05','Concepción'), D('06','San José'), D('07','Santa Eulalia'), D('08','Escobal')]),
    C('06','Naranjo', [D('01','Naranjo'), D('02','San Miguel'), D('03','San José'), D('04','Cirrí Sur'), D('05','San Jerónimo'), D('06','San Juan'), D('07','El Rosario'), D('08','Palmitos')]),
    C('07','Palmares', [D('01','Palmares'), D('02','Zaragoza'), D('03','Buenos Aires'), D('04','Santiago'), D('05','Candelaria'), D('06','Esquipulas'), D('07','La Granja')]),
    C('08','Poás', [D('01','San Pedro'), D('02','San Juan'), D('03','San Rafael'), D('04','Carrillos'), D('05','Sabana Redonda')]),
    C('09','Orotina', [D('01','Orotina'), D('02','El Mastate'), D('03','Hacienda Vieja'), D('04','Coyolar'), D('05','La Ceiba')]),
    C('10','San Carlos', [D('01','Quezada'), D('02','Florencia'), D('03','Buenavista'), D('04','Aguas Zarcas'), D('05','Venecia'), D('06','Pital'), D('07','La Fortuna'), D('08','La Tigra'), D('09','La Palmera'), D('10','Venado'), D('11','Cutris'), D('12','Monterrey'), D('13','Pocosol')]),
    C('11','Zarcero', [D('01','Zarcero'), D('02','Laguna'), D('03','Tapesco'), D('04','Guadalupe'), D('05','Palmira'), D('06','Zapote'), D('07','Brisas')]),
    C('12','Sarchí', [D('01','Sarchí Norte'), D('02','Sarchí Sur'), D('03','Toro Amarillo'), D('04','San Pedro'), D('05','Rodríguez')]),
    C('13','Upala', [D('01','Upala'), D('02','Aguas Claras'), D('03','San José o Pizote'), D('04','Bijagua'), D('05','Delicias'), D('06','Dos Ríos'), D('07','Yolillal'), D('08','Canalete')]),
    C('14','Los Chiles', [D('01','Los Chiles'), D('02','Caño Negro'), D('03','El Amparo'), D('04','San Jorge')]),
    C('15','Guatuso', [D('01','San Rafael'), D('02','Buenavista'), D('03','Cote'), D('04','Katira')]),
    C('16','Río Cuarto', [D('01','Río Cuarto'), D('02','Santa Rita'), D('03','Santa Isabel')]),
  ]},
  { code: '3', name: 'Cartago', cantons: [
    C('01','Cartago', [D('01','Oriental'), D('02','Occidental'), D('03','Carmen'), D('04','San Nicolás'), D('05','Aguacaliente o San Francisco'), D('06','Guadalupe o Arenilla'), D('07','Corralillo'), D('08','Tierra Blanca'), D('09','Dulce Nombre'), D('10','Llano Grande'), D('11','Quebradilla')]),
    C('02','Paraíso', [D('01','Paraíso'), D('02','Santiago'), D('03','Orosi'), D('04','Cachí'), D('05','Llanos de Santa Lucía'), D('06','Birrisito')]),
    C('03','La Unión', [D('01','Tres Ríos'), D('02','San Diego'), D('03','San Juan'), D('04','San Rafael'), D('05','Concepción'), D('06','Dulce Nombre'), D('07','San Ramón'), D('08','Rio Azul')]),
    C('04','Jiménez', [D('01','Juan Viñas'), D('02','Tucurrique'), D('03','Pejibaye'), D('04','La Victoria')]),
    C('05','Turrialba', [D('01','Turrialba'), D('02','La Suiza'), D('03','Peralta'), D('04','Santa Cruz'), D('05','Santa Teresita'), D('06','Pavones'), D('07','Tuis'), D('08','Tayutic'), D('09','Santa Rosa'), D('10','Tres Equis'), D('11','La Isabel'), D('12','Chirripó')]),
    C('06','Alvarado', [D('01','Pacayas'), D('02','Cervantes'), D('03','Capellades')]),
    C('07','Oreamuno', [D('01','San Rafael'), D('02','Cot'), D('03','Potrero Cerrado'), D('04','Cipreses'), D('05','Santa Rosa')]),
    C('08','El Guarco', [D('01','El Tejar'), D('02','San Isidro'), D('03','Tobosi'), D('04','Patio de Agua')]),
  ]},
  { code: '4', name: 'Heredia', cantons: [
    C('01','Heredia', [D('01','Heredia'), D('02','Mercedes'), D('03','San Francisco'), D('04','Ulloa'), D('05','Varablanca')]),
    C('02','Barva', [D('01','Barva'), D('02','San Pedro'), D('03','San Pablo'), D('04','San Roque'), D('05','Santa Lucía'), D('06','San José de la Montaña')]),
    C('03','Santo Domingo', [D('01','Santo Domingo'), D('02','San Vicente'), D('03','San Miguel'), D('04','Paracito'), D('05','Santo Tomás'), D('06','Santa Rosa'), D('07','Tures'), D('08','Pará')]),
    C('04','Santa Bárbara', [D('01','Santa Bárbara'), D('02','San Pedro'), D('03','San Juan'), D('04','Jesús'), D('05','Santo Domingo'), D('06','Purabá')]),
    C('05','San Rafael', [D('01','San Rafael'), D('02','San Josecito'), D('03','Santiago'), D('04','Ángeles'), D('05','Concepción')]),
    C('06','San Isidro', [D('01','San Isidro'), D('02','San José'), D('03','Concepción'), D('04','San Francisco')]),
    C('07','Belén', [D('01','San Antonio'), D('02','La Ribera'), D('03','La Asunción')]),
    C('08','Flores', [D('01','San Joaquín'), D('02','Barrantes'), D('03','Llorente')]),
    C('09','San Pablo', [D('01','San Pablo'), D('02','Rincón de Sabanilla')]),
    C('10','Sarapiquí', [D('01','Puerto Viejo'), D('02','La Virgen'), D('03','Horquetas'), D('04','Llanuras del Gaspar'), D('05','Cureña')]),
  ]},
  { code: '5', name: 'Guanacaste', cantons: [
    C('01','Liberia', [D('01','Liberia'), D('02','Mayorga'), D('03','Nacascolo'), D('04','Curubandé'), D('05','Cañas Dulces')]),
    C('02','Nicoya', [D('01','Nicoya'), D('02','Mansión'), D('03','San Antonio'), D('04','Quebrada Honda'), D('05','Sámara'), D('06','Nosara'), D('07','Belén de Nosarita')]),
    C('03','Santa Cruz', [D('01','Santa Cruz'), D('02','Bolsón'), D('03','Veintisiete de Abril'), D('04','Tempate'), D('05','Cartagena'), D('06','Cuajiniquil'), D('07','Diriá'), D('08','Cabo Velas'), D('09','Tamarindo')]),
    C('04','Bagaces', [D('01','Bagaces'), D('02','La Fortuna'), D('03','Mogote'), D('04','Río Naranjo')]),
    C('05','Carrillo', [D('01','Filadelfia'), D('02','Palmira'), D('03','San Blas'), D('04','Sardinal')]),
    C('06','Cañas', [D('01','Cañas'), D('02','Palmira'), D('03','San Miguel'), D('04','Bebedero'), D('05','Porozal')]),
    C('07','Abangares', [D('01','Las Juntas'), D('02','Sierra'), D('03','San Juan'), D('04','Colorado')]),
    C('08','Tilarán', [D('01','Tilarán'), D('02','Quebrada Grande'), D('03','Tronadora'), D('04','Santa Rosa'), D('05','Líbano'), D('06','Tierras Morenas'), D('07','Arenal'), D('08','Cabeceras')]),
    C('09','Nandayure', [D('01','Carmona'), D('02','Santa Rita'), D('03','Zapotal'), D('04','San Pablo'), D('05','Porvenir'), D('06','Bejuco')]),
    C('10','La Cruz', [D('01','La Cruz'), D('02','Santa Cecilia'), D('03','La Garita'), D('04','Santa Elena')]),
    C('11','Hojancha', [D('01','Hojancha'), D('02','Monte Romo'), D('03','Puerto Carrillo'), D('04','Huatuso'), D('05','Matambú')]),
  ]},
  { code: '6', name: 'Puntarenas', cantons: [
    C('01','Puntarenas', [D('01','Puntarenas'), D('02','Alajuelita'), D('03','Barrio Nuevo'), D('04','Chira'), D('05','Acajutla'), D('06','Lepanto'), D('07','Paquera'), D('08','Manzanillo'), D('09','Guacimal'), D('10','Barranca'), D('11','Chachagua'), D('12','Cóbano'), D('13','Chacarita'), D('14','Chomes'), D('15','El Roble'), D('16','Arancibia')]),
    C('02','Esparza', [D('01','Espíritu Santo'), D('02','San Juan Grande'), D('03','Macacona'), D('04','San Rafael'), D('05','San Jerónimo'), D('06','Caldera')]),
    C('03','Buenos Aires', [D('01','Buenos Aires'), D('02','Volcán'), D('03','Potrero Grande'), D('04','Boruca'), D('05','Pilas'), D('06','Colinas'), D('07','Chánguena'), D('08','Biolley'), D('09','Brunka')]),
    C('04','Montes de Oro', [D('01','Miramar'), D('02','La Unión'), D('03','San Isidro')]),
    C('05','Osa', [D('01','Puerto Cortés'), D('02','Palmar'), D('03','Sierpe'), D('04','Bahía Ballena'), D('05','Piedras Blancas'), D('06','Bahía Drake')]),
    C('06','Quepos', [D('01','Quepos'), D('02','Savegre'), D('03','Naranjito')]),
    C('07','Golfito', [D('01','Golfito'), D('02','Guaycará'), D('03','Pavón')]),
    C('08','Coto Brus', [D('01','San Vito'), D('02','Sabalito'), D('03','Aguabuena'), D('04','Limoncito'), D('05','Bioley'), D('06','Gutiérrez Braun')]),
    C('09','Parrita', [D('01','Parrita')]),
    C('10','Corredores', [D('01','Corredor'), D('02','La Cuesta'), D('03','Canoas'), D('04','Laurel')]),
    C('11','Garabito', [D('01','Jacó'), D('02','Tárcoles'), D('03','Lagunillas')]),
    C('12','Monteverde', [D('01','Monteverde')]),
    C('13','Puerto Jiménez', [D('01','Puerto Jiménez')]),
  ]},
  { code: '7', name: 'Limón', cantons: [
    C('01','Limón', [D('01','Limón'), D('02','Valle de La Estrella'), D('03','Río Blanco'), D('04','Matama')]),
    C('02','Pococí', [D('01','Guápiles'), D('02','Jiménez'), D('03','Rita'), D('04','Roxana'), D('05','Cariari'), D('06','Colorado'), D('07','La Colonia')]),
    C('03','Siquirres', [D('01','Siquirres'), D('02','Pacuarito'), D('03','Florida'), D('04','Germania'), D('05','El Cairo'), D('06','Alegría'), D('07','Reventazón')]),
    C('04','Talamanca', [D('01','Bratsi'), D('02','Sixaola'), D('03','Cahuita'), D('04','Telire')]),
    C('05','Matina', [D('01','Matina'), D('02','Batán'), D('03','Carrandí')]),
    C('06','Guácimo', [D('01','Guácimo'), D('02','Mercedes'), D('03','Pocora'), D('04','Río Jiménez'), D('05','Duacarí')]),
  ]},
];

// Helper functions útiles para formularios dinámicos
export function cantonsOf(provinceCode: string): CRCanton[] {
  return CR_PROVINCES.find(p => p.code === provinceCode)?.cantons ?? [];
}

export function districtsOf(provinceCode: string, cantonCode: string): CRDistrict[] {
  const province = CR_PROVINCES.find(p => p.code === provinceCode);
  const canton = province?.cantons.find(c => c.code === cantonCode);
  return canton?.districts ?? [];
}
